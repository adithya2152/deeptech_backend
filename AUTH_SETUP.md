# Authentication System Documentation

This document outlines the complete authentication system setup using Supabase Auth and JWT sessions.

## Overview

The authentication system uses:

- **Supabase Auth** for user registration and email verification
- **JWT (JSON Web Tokens)** for session management
- **PostgreSQL** for user profile storage
- **Role-Based Access Control (RBAC)** for authorization

## Architecture

```
Client Request
    ↓
CORS & Logger Middleware
    ↓
Auth Middleware (Optional)
    ↓
RBAC Middleware (If role-based route)
    ↓
Controller Logic
    ↓
Supabase Auth / PostgreSQL
    ↓
JWT Token Generation
    ↓
Response to Client
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs:

- `jsonwebtoken` - JWT token generation and verification
- `bcryptjs` - Password hashing
- `express-validator` - Input validation
- `@supabase/supabase-js` - Supabase client
- `dotenv` - Environment variable management

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required Variables:**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-secure-random-key
```

Generate a secure JWT_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Setup

The system uses PostgreSQL with Supabase. Ensure your `profiles` table has these columns:

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'expert', 'admin')),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    last_logout TIMESTAMP
);
```

## API Endpoints

### Authentication Endpoints

#### 1. Sign Up

```
POST /api/auth/signup
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user"
}

Response (201):
{
    "success": true,
    "message": "User created successfully",
    "data": {
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe",
            "role": "user"
        },
        "tokens": {
            "accessToken": "jwt-token",
            "refreshToken": "jwt-token"
        }
    }
}
```

#### 2. Login

```
POST /api/auth/login
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePassword123!"
}

Response (200):
{
    "success": true,
    "message": "Login successful",
    "data": {
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe",
            "role": "user"
        },
        "tokens": {
            "accessToken": "jwt-token",
            "refreshToken": "jwt-token"
        }
    }
}
```

#### 3. Refresh Access Token

```
POST /api/auth/refresh-token
Content-Type: application/json

{
    "refreshToken": "refresh-jwt-token"
}

Response (200):
{
    "success": true,
    "message": "Access token refreshed",
    "data": {
        "accessToken": "new-jwt-token"
    }
}
```

#### 4. Logout

```
POST /api/auth/logout
Authorization: Bearer access-token

Response (200):
{
    "success": true,
    "message": "Logout successful"
}
```

#### 5. Get Current User

```
GET /api/auth/me
Authorization: Bearer access-token

Response (200):
{
    "success": true,
    "data": {
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe",
            "role": "user",
            "createdAt": "2024-01-01T00:00:00Z",
            "lastLogin": "2024-01-15T12:30:00Z"
        }
    }
}
```

#### 6. Verify Email

```
POST /api/auth/verify-email?token=verification-token&type=signup
```

## Middleware Usage

### 1. Authentication Middleware (`auth`)

Protects routes that require authentication:

```javascript
import { auth } from "../middleware/auth.js";

router.get("/protected-route", auth, controller);
```

**Features:**

- Validates JWT token
- Extracts user info and attaches to `req.user`
- Returns 401 for missing/invalid tokens

### 2. Optional Auth Middleware (`optionalAuth`)

For routes that work with or without authentication:

```javascript
import { optionalAuth } from "../middleware/auth.js";

router.get("/optional-auth-route", optionalAuth, controller);
```

### 3. Role-Based Access Control Middleware

#### Require Specific Role

```javascript
import { requireRole } from "../middleware/rbac.js";

// Only allow admins
router.delete("/admin-route", requireRole("admin"), controller);

// Allow multiple roles
router.post("/sensitive-route", requireRole("admin", "moderator"), controller);
```

#### Specific Role Shortcuts

```javascript
import {
  requireAdmin,
  requireExpert,
  requireUser,
} from "../middleware/rbac.js";

router.post("/admin-only", requireAdmin, controller);
router.get("/expert-resources", requireExpert, controller);
```

#### Owner or Admin

```javascript
import { isOwnerOrAdmin } from "../middleware/rbac.js";

// User can only access/modify their own resources
router.patch("/users/:userId", isOwnerOrAdmin, controller);
```

### 4. Request Logger Middleware

Logs all requests and responses:

```javascript
import { requestLogger } from "../middleware/logger.js";

app.use(requestLogger);
```

## JWT Token Structure

### Access Token (24 hours by default)

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "iat": 1642598400,
  "exp": 1642684800
}
```

### Refresh Token (7 days by default)

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "type": "refresh",
  "iat": 1642598400,
  "exp": 1643203200
}
```

## Token Usage in Requests

Include the access token in the Authorization header:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
     https://api.example.com/api/auth/me
```

## Error Handling

### Common Error Responses

**Invalid Credentials (401)**

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**Token Expired (401)**

```json
{
  "success": false,
  "message": "Token expired. Please login again.",
  "code": "TOKEN_EXPIRED"
}
```

**Insufficient Permissions (403)**

```json
{
  "success": false,
  "message": "Forbidden: Insufficient permissions",
  "requiredRoles": ["admin"],
  "userRole": "user"
}
```

**Validation Error (400)**

```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Valid email is required"
    }
  ]
}
```

## Utility Functions

### Auth Utils (`utils/authUtils.js`)

```javascript
import {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyToken,
  validatePasswordStrength,
  isValidEmail,
  generateOTP,
  verifyOTP,
} from "../utils/authUtils.js";

// Hash a password
const hashed = await hashPassword("password123");

// Compare passwords
const isMatch = await comparePassword("password123", hashed);

// Generate tokens
const { accessToken, refreshToken } = generateTokens(userId, email, role);

// Verify token
const decoded = verifyToken(token, "access");

// Validate password strength
const strength = validatePasswordStrength("Password123!");
// Returns: { isStrong: true, strength: 5, requirements: {...}, feedback: [] }

// Validate email
const valid = isValidEmail("user@example.com"); // true
```

## Security Best Practices

1. **JWT Secret**: Use a strong, random secret. Rotate periodically.

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **HTTPS Only**: Always use HTTPS in production.

3. **Token Storage**: Store tokens securely:

   - Access token: Memory or httpOnly cookie
   - Refresh token: Secure httpOnly cookie

4. **Token Expiry**:

   - Access: 24 hours (short-lived)
   - Refresh: 7 days (longer-lived)

5. **Password Requirements**:

   - Minimum 6 characters (enforced in signup)
   - Recommend 8+ characters
   - Mix of uppercase, lowercase, numbers, special chars

6. **CORS**: Configure CORS properly in production:

   ```javascript
   const allowedOrigins = ["https://yourdomain.com"];
   app.use(
     cors({
       origin: allowedOrigins,
       credentials: true,
     })
   );
   ```

7. **Rate Limiting**: Consider adding rate limiting for auth endpoints.

## Testing Authentication

### Using cURL

**Sign Up**

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Access Protected Route**

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer your-access-token"
```

**Refresh Token**

```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token"
  }'
```

## Troubleshooting

### Issue: "SUPABASE_URL not defined"

**Solution**: Ensure `.env` file exists and contains `SUPABASE_URL`.

### Issue: "JWT_SECRET not defined"

**Solution**: Add `JWT_SECRET` to `.env`. Generate using:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue: Token expired error

**Solution**: Use refresh token endpoint to get a new access token.

### Issue: Database connection error

**Solution**: Verify `SUPABASE_CONNECTION_STRING` and network connectivity.

### Issue: CORS errors

**Solution**: Check CORS configuration in `server.js` and ensure frontend URL is allowed.

## Environment Setup Checklist

- [ ] Supabase project created
- [ ] `.env` file configured with all required variables
- [ ] PostgreSQL database connected
- [ ] `profiles` table created with required columns
- [ ] Dependencies installed (`npm install`)
- [ ] Server running (`npm start`)
- [ ] Test endpoints with cURL or Postman
- [ ] Implement frontend token storage and refresh logic

## Advanced Configuration

### Custom Token Claims

Modify `generateTokens` in `controllers/authController.js` to add custom claims:

```javascript
const accessToken = jwt.sign(
  {
    id: userId,
    email,
    role,
    type: "access",
    // Add custom claims
    permissions: ["read", "write"],
    department: "engineering",
  },
  jwtSecret,
  { expiresIn: jwtExpiry }
);
```

### Multi-Factor Authentication

Add MFA flow after password verification using Supabase:

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (data.user && data.user.factors) {
  // User has MFA enabled
  // Handle MFA challenge
}
```

## Support

For issues or questions:

1. Check this documentation
2. Review error messages
3. Check database connection
4. Verify environment variables
5. Check Supabase dashboard for auth logs
