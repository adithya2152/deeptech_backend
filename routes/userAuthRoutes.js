import express from "express";
import { body, validationResult } from "express-validator";
import { auth, optionalAuth } from "../middleware/auth.js";
import {
  signup,
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  verifyEmail,
  updateCurrentUser
} from "../controllers/authController.js";

const router = express.Router();

// Validation middleware
const validateEmail = body("email")
  .isEmail()
  .normalizeEmail()
  .withMessage("Valid email is required");

const validatePassword = body("password")
  .isLength({ min: 6 })
  .withMessage("Password must be at least 6 characters long");

const validateSignup = [
  validateEmail,
  validatePassword,
  body("first_name").notEmpty().trim().escape().withMessage("First name required"),
  body("last_name").notEmpty().trim().escape().withMessage("Last name required"),
  body("role").isIn(["buyer", "expert"]).withMessage("Valid role required"),
];

const validateLogin = [
  validateEmail,
  body("password").notEmpty().withMessage("Password is required"),
];

// Error handling middleware for validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    
    console.log('❌ VALIDATION ERRORS:', errors.array());
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: errors.array(),
    });
  }
  next();
};

// Test endpoint
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth routes are working!",
    timestamp: new Date().toISOString(),
  });
});

// Authentication endpoints
router.post("/register", validateSignup, handleValidationErrors, signup);

router.post("/login", validateLogin, handleValidationErrors, login);

router.post("/refresh-token", refreshAccessToken);

router.post("/logout", auth, logout);

router.get("/me", auth, getCurrentUser);

router.post("/verify-email", verifyEmail);

router.patch("/me", auth, updateCurrentUser);

export default router;
