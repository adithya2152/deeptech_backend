# Authentication Usage Examples

This file contains practical examples of how to use the authentication system in your routes.

## Table of Contents

1. [Basic Protected Routes](#basic-protected-routes)
2. [Role-Based Routes](#role-based-routes)
3. [Using User Context](#using-user-context)
4. [Error Handling](#error-handling)
5. [Frontend Integration](#frontend-integration)

---

## Basic Protected Routes

### Example 1: Simple Protected Route

```javascript
import express from "express";
import { auth } from "../middleware/auth.js";
import * as controller from "../controllers/someController.js";

const router = express.Router();

// Any authenticated user can access
router.get("/user-data", auth, controller.getUserData);

router.post("/user-action", auth, controller.performAction);

export default router;
```

**Controller:**

```javascript
export const getUserData = async (req, res) => {
  try {
    const userId = req.user.id; // From JWT token
    const email = req.user.email;

    // Fetch user-specific data
    const result = await pool.query(
      "SELECT * FROM user_data WHERE user_id = $1",
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```

---

## Role-Based Routes

### Example 2: Admin-Only Route

```javascript
import { requireAdmin } from "../middleware/rbac.js";
import * as adminController from "../controllers/adminController.js";

// Only admins can delete users
router.delete("/users/:id", requireAdmin, adminController.deleteUser);

router.post("/settings", requireAdmin, adminController.updateSettings);
```

**Controller:**

```javascript
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = req.user.id; // Admin performing the action

    // Perform deletion with audit log
    await pool.query("DELETE FROM profiles WHERE id = $1", [userId]);

    // Log the action
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, target_user_id) VALUES ($1, $2, $3)",
      [adminId, "DELETE_USER", userId]
    );

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

### Example 3: Expert-Only Routes

```javascript
import { requireExpert } from "../middleware/rbac.js";
import * as expertController from "../controllers/expertController.js";

// Only experts can create services
router.post("/services", requireExpert, expertController.createService);

// Only experts can accept projects
router.post(
  "/projects/:id/accept",
  requireExpert,
  expertController.acceptProject
);
```

### Example 4: Multiple Roles Allowed

```javascript
import { requireRole } from "../middleware/rbac.js";

// Only admins and moderators can manage users
router.patch(
  "/users/:id/status",
  requireRole("admin", "moderator"),
  controller.updateUserStatus
);

// Users, experts, and admins can view projects
router.get(
  "/projects",
  requireRole("user", "expert", "admin"),
  controller.getProjects
);
```

### Example 5: Owner or Admin Can Access

```javascript
import { isOwnerOrAdmin } from "../middleware/rbac.js";

// Users can only access their own profile
router.get("/users/:userId/profile", isOwnerOrAdmin, controller.getProfile);

router.patch(
  "/users/:userId/profile",
  isOwnerOrAdmin,
  controller.updateProfile
);

router.delete(
  "/users/:userId/account",
  isOwnerOrAdmin,
  controller.deleteAccount
);
```

---

## Using User Context

### Example 6: Access User Information in Controllers

```javascript
export const updateUserProfile = async (req, res) => {
  try {
    // Get current user from token
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userRole = req.user.role;

    const { firstName, lastName } = req.body;

    // Update profile
    const result = await pool.query(
      `UPDATE profiles 
       SET first_name = $1, last_name = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [firstName, lastName, userId]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

### Example 7: Filter Data Based on Role

```javascript
export const getProjects = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = "SELECT * FROM projects WHERE ";
    let params = [];

    if (userRole === "admin") {
      // Admins see all projects
      query += "1=1";
    } else if (userRole === "expert") {
      // Experts see their projects
      query += "expert_id = $1";
      params.push(userId);
    } else {
      // Users see their posted projects
      query += "client_id = $1";
      params.push(userId);
    }

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

---

## Error Handling

### Example 8: Graceful Error Handling

```javascript
export const sensitiveOperation = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Your logic
    const result = await performOperation(userId);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Operation error:", error);

    if (error.code === "PERMISSION_DENIED") {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    res.status(500).json({
      success: false,
      message: "An error occurred",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    });
  }
};
```

### Example 9: Token Validation Before Sensitive Operations

```javascript
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.userId;

    // Verify user is deleting their own account or is admin
    if (userId !== targetUserId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete another user's account",
      });
    }

    // Verify token still valid
    if (req.user.exp * 1000 < Date.now()) {
      return res.status(401).json({
        success: false,
        message: "Session expired, please login again",
      });
    }

    // Perform deletion
    await pool.query("DELETE FROM profiles WHERE id = $1", [targetUserId]);

    res.json({ success: true, message: "Account deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

---

## Frontend Integration

### Example 10: React Component with Authentication

```javascript
import React, { useState, useEffect } from "react";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("accessToken");

      if (!token) {
        setError("No authentication token found");
        setLoading(false);
        return;
      }

      const response = await fetch("http://localhost:3000/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        // Token expired, try to refresh
        await refreshToken();
        return;
      }

      const data = await response.json();

      if (data.success) {
        setUser(data.data.user);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshToken = async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");

      const response = await fetch(
        "http://localhost:3000/api/auth/refresh-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        }
      );

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("accessToken", data.data.accessToken);
        await fetchUserData(); // Retry original request
      } else {
        // Refresh failed, redirect to login
        window.location.href = "/login";
      }
    } catch (err) {
      window.location.href = "/login";
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem("accessToken");

      await fetch("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Welcome, {user?.firstName}!</h1>
      <p>Email: {user?.email}</p>
      <p>Role: {user?.role}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

export default Dashboard;
```

### Example 11: Login Form

```javascript
import React, { useState } from "react";

const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        // Store tokens
        localStorage.setItem("accessToken", data.data.tokens.accessToken);
        localStorage.setItem("refreshToken", data.data.tokens.refreshToken);

        // Redirect to dashboard
        window.location.href = "/dashboard";
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Logging in..." : "Login"}
      </button>
    </form>
  );
};

export default LoginForm;
```

### Example 12: API Service Class

```javascript
class AuthService {
  constructor(baseURL = "http://localhost:3000") {
    this.baseURL = baseURL;
  }

  async signup(email, password, firstName, lastName) {
    const response = await fetch(`${this.baseURL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
    return response.json();
  }

  async login(email, password) {
    const response = await fetch(`${this.baseURL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  }

  async getMe() {
    const token = this.getAccessToken();
    const response = await fetch(`${this.baseURL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  }

  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    const response = await fetch(`${this.baseURL}/api/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();

    if (data.success) {
      this.setAccessToken(data.data.accessToken);
    }

    return data;
  }

  async logout() {
    const token = this.getAccessToken();
    await fetch(`${this.baseURL}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    this.clearTokens();
  }

  getAccessToken() {
    return localStorage.getItem("accessToken");
  }

  getRefreshToken() {
    return localStorage.getItem("refreshToken");
  }

  setAccessToken(token) {
    localStorage.setItem("accessToken", token);
  }

  setRefreshToken(token) {
    localStorage.setItem("refreshToken", token);
  }

  clearTokens() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }

  isAuthenticated() {
    return !!this.getAccessToken();
  }
}

export default new AuthService();
```

---

## Complete Project Example

### Project Route with Auth

```javascript
import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole, isOwnerOrAdmin } from "../middleware/rbac.js";
import * as projectController from "../controllers/projectController.js";

const router = express.Router();

// List projects (anyone authenticated)
router.get("/", auth, projectController.getProjects);

// Get single project
router.get("/:id", auth, projectController.getProject);

// Create project (users and experts)
router.post(
  "/",
  requireRole("user", "expert"),
  projectController.createProject
);

// Update project (owner or admin)
router.patch("/:id", auth, projectController.updateProject);

// Delete project (owner or admin)
router.delete(
  "/:id",
  requireRole("user", "admin"),
  projectController.deleteProject
);

// Accept project (expert only)
router.post(
  "/:id/accept",
  requireRole("expert"),
  projectController.acceptProject
);

export default router;
```

**Controller:**

```javascript
export const createProject = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const userRole = req.user.role; // From auth middleware
    const { title, description, budget } = req.body;

    // Create project
    const result = await pool.query(
      `INSERT INTO projects (client_id, title, description, budget, status, created_at)
       VALUES ($1, $2, $3, $4, 'open', NOW())
       RETURNING *`,
      [userId, title, description, budget]
    );

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

---

## Best Practices

1. **Always check req.user** in protected routes
2. **Use specific roles** instead of broad permissions
3. **Log security events** (logins, permission denials)
4. **Validate input** even in authenticated routes
5. **Handle token expiration** gracefully on frontend
6. **Use HTTPS** in production
7. **Never expose sensitive data** in error messages
8. **Implement rate limiting** for auth endpoints
9. **Keep tokens short-lived** for security
10. **Test all role combinations** before deployment

---

These examples show the complete integration of the authentication system with your existing controllers and routes.
