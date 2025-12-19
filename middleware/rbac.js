import { auth } from "./auth.js";

// Middleware to check if user has required role
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // First verify the token
    auth(req, res, () => {
      const userRole = req.user?.role; // Get user role from decoded token

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Insufficient permissions",
          requiredRoles: allowedRoles,
          userRole,
        });
      }

      next();
    });
  };
};

// Specific role middlewares
export const requireAdmin = requireRole("admin");
export const requireExpert = requireRole("expert");
export const requireUser = requireRole("buyer", "expert", "admin");

// Check if user is the resource owner or admin
export const isOwnerOrAdmin = (req, res, next) => {
  auth(req, res, () => {
    const userId = req.user?.id;
    const resourceOwnerId = req.params.userId || req.body.userId;

    if (userId !== resourceOwnerId && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You can only access your own resources",
      });
    }

    next();
  });
};

// Check if user is admin or moderator
export const isAdminOrModerator = requireRole("admin", "moderator");

// Check if user is verified (email verified, kyc done, etc.)
export const requireVerified = (req, res, next) => {
  auth(req, res, () => {
    const isVerified = req.user?.isVerified || req.user?.email_verified;

    if (!isVerified) {
      return res.status(403).json({
        success: false,
        message: "User must be verified to access this resource",
      });
    }

    next();
  });
};

export default requireRole;
