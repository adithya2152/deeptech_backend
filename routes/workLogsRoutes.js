import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";
import * as workLogsController from "../controllers/workLogsController.js";

const router = express.Router();

// Create a new work log (Experts only) - with file upload support
router.post(
  "/",
  auth,
  requireRole("expert"),
  uploadMultiple("attachments", 10), // Allow up to 10 attachments
  handleUploadError,
  workLogsController.validateWorkLog,
  workLogsController.createWorkLog
);

// Get all work logs for a contract
router.get(
  "/contract/:contractId",
  auth,
  workLogsController.getWorkLogsByContract
);

// Get all work logs for current expert
router.get(
  "/expert/my-logs",
  auth,
  requireRole("expert"),
  workLogsController.getMyWorkLogs
);

// Get work log by ID
router.get("/:workLogId", auth, workLogsController.getWorkLogById);

export default router;
