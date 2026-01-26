import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";
import TimeEntryController from "../controllers/timeEntryController.js";

const router = express.Router();

// Create time entry (expert only)
router.post(
    "/",
    auth,
    requireRole("expert"),
    uploadMultiple("attachments", 10),
    handleUploadError,
    TimeEntryController.validateTimeEntry,
    TimeEntryController.createTimeEntry
);

// Get time entries for a contract
router.get(
    "/contract/:contractId",
    auth,
    TimeEntryController.getTimeEntriesByContract
);

// Get time entry summary for a contract
router.get(
    "/contract/:contractId/summary",
    auth,
    TimeEntryController.getTimeEntrySummary
);

// Update time entry (expert only, draft status)
router.patch(
    "/:id",
    auth,
    requireRole("expert"),
    uploadMultiple("attachments", 10),
    handleUploadError,
    TimeEntryController.updateTimeEntry
);

// Submit time entry for approval (expert only)
router.post(
    "/:id/submit",
    requireRole("expert"),
    TimeEntryController.submitTimeEntry
);

// Approve time entry (buyer only)
router.post(
    "/:id/approve",
    requireRole("buyer"),
    TimeEntryController.approveTimeEntry
);

// Reject time entry (buyer only)
router.post(
    "/:id/reject",
    requireRole("buyer"),
    TimeEntryController.rejectTimeEntry
);

// Delete time entry (expert only, draft status)
router.delete(
    "/:id",
    requireRole("expert"),
    TimeEntryController.deleteTimeEntry
);

export default router;
