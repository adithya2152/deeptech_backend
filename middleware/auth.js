import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

// Helper to get active profile for a user
// Returns the active profile (is_active = true) for the given user
const getActiveProfile = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active 
       FROM profiles 
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[getActiveProfile] Error:', err);
    return null;
  }
};

// Helper to determine the active role from profiles.is_active
const getActiveRole = async (userId) => {
  try {
    const profile = await getActiveProfile(userId);
    if (profile) {
      return profile.profile_type; // 'expert' or 'buyer'
    }
    return 'buyer'; // Default fallback
  } catch (err) {
    console.error('[getActiveRole] Error:', err);
    return 'buyer';
  }
};

const auth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access Denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // Protected routes must use access tokens only
    if (decoded?.type && decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type.",
        code: "INVALID_TOKEN_TYPE",
      });
    }

    // Query user_accounts for ban status + account role (not profiles)
    const { rows: userRows } = await pool.query(
      'SELECT is_banned, ban_reason, role FROM user_accounts WHERE id = $1',
      [decoded.id]
    );

    if (userRows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (userRows[0].is_banned) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended.",
        reason: userRows[0].ban_reason,
        code: "USER_BANNED"
      });
    }

    const accountRole = userRows[0]?.role;

    // Get active profile for this user
    const activeProfile = await getActiveProfile(decoded.id);
    const activeRole = activeProfile?.profile_type || accountRole || 'buyer';

    // Prevent using stale tokens after role switching
    // Compare JWT role against the ACTIVE role from profiles.is_active
    // Admins may not have an active 'admin' profile row; allow admin JWTs as long as user_accounts.role is admin.
    const isAdminAccount = accountRole === 'admin';
    const isAdminToken = decoded?.role === 'admin';

    if (decoded?.role && activeRole && decoded.role !== activeRole && !(isAdminAccount && isAdminToken)) {
      return res.status(401).json({
        success: false,
        message: "Role changed. Please refresh your session.",
        code: "ROLE_CHANGED",
      });
    }

    // Attach both user ID and profile info to request
    req.user = {
      ...decoded,
      accountRole,
      profileId: activeProfile?.id || null,
      profileType: activeRole,
    };
    next();
  } catch (err) {
    console.error("Auth Error: ", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid Token.",
      code: "INVALID_TOKEN",
    });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      req.user = {
        id: decoded.id || decoded.userId,
        profileId: decoded.profileId || null,
        ...decoded,
      };
    } catch (err) {
      console.error("JWT Verification Error: ", err.message);
    }
  }

  next();
};

export { auth, optionalAuth, getActiveProfile, getActiveRole };