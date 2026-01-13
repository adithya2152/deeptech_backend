import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";
import * as workLogsController from "../controllers/workLogController.js";

const router = express.Router();

// Create a new work log (Experts only)
router.post(
  "/",
  auth,
  requireRole("expert"),
  uploadMultiple("attachments", 10),
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

// ✅ Approve / Reject work log (Buyer only)
router.patch(
  "/:workLogId",
  auth,
  requireRole("buyer"),
  workLogsController.updateWorkLogStatus
);

// Get work log by ID
router.get("/:workLogId", auth, workLogsController.getWorkLogById);

// Finish sprint (Buyer only)
router.post(
  "/:id/finish-sprint",
  auth,
  requireRole("buyer"),
  workLogsController.finishSprint
);

// Expert can edit own submitted logs
router.patch(
  '/:workLogId/edit',
  auth,
  requireRole('expert'),
  uploadMultiple('attachments', 10),
  handleUploadError,
  workLogsController.updateWorkLogContent
);

export default router;