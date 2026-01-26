import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";
import * as dayWorkSummaryController from "../controllers/dayWorkSummaryController.js";

const router = express.Router();

// Create a new day work summary (Expert only)
router.post(
  "/",
  auth,
  requireRole("expert"),
  uploadMultiple("attachments", 10),
  handleUploadError,
  dayWorkSummaryController.validateDayWorkSummary,
  dayWorkSummaryController.createDayWorkSummary
);

// Get my day work summaries (Expert only)
router.get(
  "/my-summaries",
  auth,
  requireRole("expert"),
  dayWorkSummaryController.getMyDayWorkSummaries
);

// Get all day work summaries for a contract
router.get(
  "/contract/:contractId",
  auth,
  dayWorkSummaryController.getDayWorkSummariesByContract
);

// Get day work summary by ID
router.get("/:summaryId", auth, dayWorkSummaryController.getDayWorkSummaryById);

// Approve or reject a day work summary (Buyer or Admin only)
router.patch(
  "/:summaryId/status",
  auth,
  dayWorkSummaryController.updateDayWorkSummaryStatus
);

export default router;
