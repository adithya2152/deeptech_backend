import express from "express";
import { body, validationResult } from "express-validator";
import { auth } from "../middleware/auth.js";
import {
  register,
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  sendEmailOtp,
  verifyEmailOtp,
  updateCurrentUser,
} from "../controllers/authController.js";

const router = express.Router();

const validateEmail = body("email")
  .isEmail()
  .normalizeEmail()
  .withMessage("Valid email is required");

const validatePassword = body("password")
  .isLength({ min: 6 })
  .withMessage("Password must be at least 6 characters long");

// RESTORED: signupTicket validation
const validateRegister = [
  validateEmail,
  validatePassword,
  body("first_name").notEmpty().trim().escape().withMessage("First name required"),
  body("last_name").notEmpty().trim().escape().withMessage("Last name required"),
  body("role").isIn(["buyer", "expert"]).withMessage("Valid role required"),
  body("signupTicket").notEmpty().withMessage("Signup verification ticket required"),
];

const validateLogin = [
  validateEmail,
  body("password").notEmpty().withMessage("Password is required"),
];

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

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth routes are working!",
    timestamp: new Date().toISOString(),
  });
});

router.post("/email/send-otp", [validateEmail], handleValidationErrors, sendEmailOtp);

router.post("/email/verify-otp", [
  validateEmail,
  body("otp").isLength({ min: 6, max: 8 }).withMessage("Invalid OTP format")
], handleValidationErrors, verifyEmailOtp);

router.post("/register", validateRegister, handleValidationErrors, register);

router.post("/login", validateLogin, handleValidationErrors, login);

router.post("/refresh-token", refreshAccessToken);

router.post("/logout", auth, logout);

router.get("/me", auth, getCurrentUser);

router.patch("/me", auth, updateCurrentUser);

export default router;