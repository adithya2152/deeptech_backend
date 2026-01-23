import express from "express";
import { body, validationResult } from "express-validator";
import { auth } from "../middleware/auth.js";
import {
  register,
  login,
  logout,
  refreshAccessToken,
  sendEmailOtp,
  verifyEmailOtp,
  requestPasswordReset,
  resetPasswordWithRecoveryTokens,
  uploadProfileMedia,
  switchRole,
  acceptAdminInvite,
  getCurrentUser,
  updateCurrentUser,
  deleteAccount,
} from "../controllers/authController.js";
import multer from "multer";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const validateEmail = body("email")
  .isEmail()
  .normalizeEmail()
  .withMessage("Valid email is required");

const validatePassword = body("password")
  .isLength({ min: 6 })
  .withMessage("Password must be at least 6 characters long");

const validateRegister = [
  validateEmail,
  validatePassword,
  body("first_name").notEmpty(),
  body("last_name").notEmpty(),
  body("role").isIn(["buyer", "expert"]),
  body("signupTicket").notEmpty(),
];

const validateLogin = [validateEmail, body("password").notEmpty()];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

router.post(
  "/email/send-otp",
  [validateEmail],
  handleValidationErrors,
  sendEmailOtp,
);

router.post(
  "/email/verify-otp",
  [validateEmail, body("otp").isLength({ min: 6, max: 8 })],
  handleValidationErrors,
  verifyEmailOtp,
);

router.post("/register", validateRegister, handleValidationErrors, register);

router.post("/login", validateLogin, handleValidationErrors, login);

router.post(
  "/password/forgot",
  [validateEmail],
  handleValidationErrors,
  requestPasswordReset,
);

router.post(
  "/password/reset",
  [
    body("accessToken").notEmpty().withMessage("accessToken is required"),
    body("refreshToken").notEmpty().withMessage("refreshToken is required"),
    validatePassword,
  ],
  handleValidationErrors,
  resetPasswordWithRecoveryTokens,
);

router.post("/refresh-token", refreshAccessToken);

router.post("/logout", auth, logout);

router.get("/me", auth, getCurrentUser);

router.put("/me", auth, updateCurrentUser);

router.patch("/me", auth, updateCurrentUser);

router.post("/profile/media", auth, upload.single("file"), uploadProfileMedia);

router.post("/switch-role", auth, switchRole);

router.post("/accept-admin-invite", auth, acceptAdminInvite);

router.delete("/account", auth, deleteAccount);

export default router;
