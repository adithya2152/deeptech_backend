# Quick Start Guide - Authentication System

## 5-Minute Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

Create `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Step 3: Create Database Table

In your Supabase SQL editor, run:

```sql
CREATE TABLE IF NOT EXISTS profiles (
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

### Step 4: Start Server

```bash
npm start
```

## API Quick Reference

### Sign Up

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {...},
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

### Use Access Token

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }'
```

## Protecting Routes

```javascript
import { auth } from "./middleware/auth.js";
import { requireRole } from "./middleware/rbac.js";

// Protected by auth
router.get("/user-data", auth, userController.getData);

// Admin only
router.delete("/admin-action", requireRole("admin"), adminController.action);

// Expert only
router.post("/expert-service", requireRole("expert"), expertController.service);
```

## Frontend Integration Example

### Store Tokens

```javascript
// After login
localStorage.setItem("accessToken", response.data.tokens.accessToken);
localStorage.setItem("refreshToken", response.data.tokens.refreshToken);
```

### Make Authenticated Requests

```javascript
const token = localStorage.getItem("accessToken");

fetch("http://localhost:3000/api/auth/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Handle Token Refresh

```javascript
async function refreshToken() {
  const refreshToken = localStorage.getItem("refreshToken");

  const response = await fetch("http://localhost:3000/api/auth/refresh-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();
  localStorage.setItem("accessToken", data.data.accessToken);
  return data.data.accessToken;
}
```

## File Structure

```
backend/
├── config/
│   ├── db.js                  # PostgreSQL connection
│   └── supabase.js            # Supabase client
├── controllers/
│   └── authController.js      # Auth logic
├── middleware/
│   ├── auth.js               # JWT verification
│   ├── rbac.js               # Role-based access control
│   └── logger.js             # Request logging
├── routes/
│   └── userAuthRoutes.js      # Auth endpoints
├── utils/
│   └── authUtils.js          # Helper functions
├── server.js                 # Main app file
├── .env                      # Environment variables
├── .env.example              # Environment template
└── AUTH_SETUP.md             # Full documentation
```

## Key Files Modified/Created

| File                            | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `package.json`                  | Added JWT, bcrypt, Supabase packages        |
| `config/supabase.js`            | Supabase client initialization              |
| `controllers/authController.js` | Auth logic (signup, login, logout, refresh) |
| `middleware/auth.js`            | JWT token verification middleware           |
| `middleware/rbac.js`            | Role-based access control middleware        |
| `middleware/logger.js`          | Request/response logging                    |
| `routes/userAuthRoutes.js`      | Auth endpoints                              |
| `utils/authUtils.js`            | Helper utilities for auth                   |
| `server.js`                     | Updated with auth routes and middleware     |
| `.env.example`                  | Environment variables template              |
| `AUTH_SETUP.md`                 | Comprehensive documentation                 |

## Environment Variables Needed

```
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-key
SUPABASE_CONNECTION_STRING=postgresql://user:pass@host/db
JWT_SECRET=your-secure-key
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d
```

## Next Steps

1. ✅ Setup complete
2. Test endpoints with cURL or Postman
3. Integrate with frontend
4. Configure additional routes with auth middleware
5. Set up email verification (Supabase emails)
6. Implement refresh token rotation
7. Add rate limiting for auth endpoints

## Troubleshooting

**"Cannot find module '@supabase/supabase-js'"**
→ Run `npm install`

**"JWT_SECRET is not defined"**
→ Add JWT_SECRET to `.env`

**"SUPABASE_URL is not set"**
→ Add SUPABASE_URL and SUPABASE_ANON_KEY to `.env`

**"Database connection failed"**
→ Check SUPABASE_CONNECTION_STRING in `.env`

For detailed docs, see `AUTH_SETUP.md`
