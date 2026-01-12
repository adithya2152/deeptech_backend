import { body, validationResult } from "express-validator";
import WorkLog from "../models/workLogModel.js";
import Contract from "../models/contractModel.js";
import { uploadMultipleFiles, BUCKETS } from "../utils/storage.js";

// Validation middleware
export const validateWorkLog = [
  body("contract_id").isUUID().withMessage("Valid contract ID is required"),
  body("type")
    .isIn(["daily_log", "sprint_submission", "milestone_request"])
    .withMessage("Invalid work log type"),
];

// Create a new work log submission
export const createWorkLog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contract_id, type, checklist, problems_faced } = req.body;
    const expertProfileId = req.user.profileId;

    // Parse checklist if it's a string
    let parsedChecklist = checklist;
    if (typeof checklist === "string") {
      try {
        parsedChecklist = JSON.parse(checklist);
      } catch (e) {
        parsedChecklist = null;
      }
    }

    // Get contract
    const contract = await Contract.getById(contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Verify expert owns this contract using expert_profile_id
    if (contract.expert_profile_id !== expertProfileId) {
      return res.status(403).json({
        success: false,
        message: "You can only submit work logs for your own contracts",
      });
    }

    // CRITICAL: Verify contract is active
    if (contract.status !== "active") {
      return res.status(400).json({
        success: false,
        message:
          "Contract must be active to submit work logs. Please ensure the NDA is signed.",
      });
    }

    // Validate based on engagement model
    const validationError = validateWorkLogByModel(
      contract.engagement_model,
      type,
      parsedChecklist
    );

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const logDate = req.body.log_date || new Date().toISOString().split('T')[0];

    // Determine sprint number (backend-owned) for sprint contracts
    let sprintNumberToSave = null;
    if (contract.engagement_model === "sprint" && type === "sprint_submission") {
      const paymentTerms =
        typeof contract.payment_terms === "string"
          ? JSON.parse(contract.payment_terms)
          : contract.payment_terms || {};

      const currentSprint =
        typeof paymentTerms.current_sprint_number === "number"
          ? paymentTerms.current_sprint_number
          : 1;

      sprintNumberToSave = currentSprint;
    }

    const submissionError = await WorkLog.validateSubmission(
      contract_id,
      type,
      sprintNumberToSave,
      logDate
    );
    if (submissionError) {
      return res.status(400).json({
        success: false,
        message: submissionError,
      });
    }

    // Handle file uploads
    let evidence = {};
    if (req.files && req.files.length > 0) {
      const files = req.files.map((file) => ({
        name: file.originalname,
        buffer: file.buffer,
        contentType: file.mimetype,
      }));

      const folder = `contract-${contract_id}/worklog-${Date.now()}`;
      const uploadedFiles = await uploadMultipleFiles(
        BUCKETS.WORK_LOGS,
        files,
        folder
      );

      evidence = {
        attachments: uploadedFiles.map((f) => ({
          name: f.path.split("/").pop(),
          url: f.url,
          path: f.path,
        })),
        summary: req.body.evidence_summary || "",
      };
    } else if (req.body.evidence) {
      try {
        evidence = typeof req.body.evidence === "string"
          ? JSON.parse(req.body.evidence)
          : req.body.evidence;

        // Validate it's a valid object
        if (typeof evidence !== 'object' || evidence === null) {
          evidence = {};
        }
      } catch (e) {
        console.warn('Invalid evidence JSON, using empty object:', req.body.evidence);
        evidence = {};
      }
    } else {
      evidence = {};
    }

    const workLog = await WorkLog.create({
      contract_id,
      type,
      checklist: parsedChecklist,
      problems_faced,
      sprint_number: sprintNumberToSave,
      evidence,
      description: req.body.description,
      log_date: logDate,
    });

    res.status(201).json({
      success: true,
      message: "Work log submitted successfully",
      data: workLog,
    });
  } catch (error) {
    console.error("Create work log error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create work log",
      error: error.message,
    });
  }
};

// Get all work logs for a contract
export const getWorkLogsByContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const profileId = req.user.profileId;

    // Get contract to verify access
    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Check access: expert, buyer, or admin using profile IDs
    if (
      contract.expert_profile_id !== profileId &&
      contract.buyer_profile_id !== profileId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to these work logs",
      });
    }

    // Get work logs
    const workLogs = await WorkLog.getByContractId(contractId);

    res.status(200).json({
      success: true,
      data: workLogs,
    });
  } catch (error) {
    console.error("Get work logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch work logs",
      error: error.message,
    });
  }
};

// Get all work logs for current expert
export const getMyWorkLogs = async (req, res) => {
  try {
    const expertProfileId = req.user.profileId;

    const workLogs = await WorkLog.getByExpertProfileId(expertProfileId);

    res.status(200).json({
      success: true,
      data: workLogs,
    });
  } catch (error) {
    console.error("Get my work logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch work logs",
      error: error.message,
    });
  }
};

// Get work log by ID
export const getWorkLogById = async (req, res) => {
  try {
    const { workLogId } = req.params;
    const profileId = req.user.profileId;

    const workLog = await WorkLog.getById(workLogId);
    if (!workLog) {
      return res.status(404).json({
        success: false,
        message: "Work log not found",
      });
    }

    // Get contract to verify access
    const contract = await Contract.getById(workLog.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Associated contract not found",
      });
    }

    // Check access using profile IDs
    if (
      contract.expert_profile_id !== profileId &&
      contract.buyer_profile_id !== profileId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this work log",
      });
    }

    res.status(200).json({
      success: true,
      data: workLog,
    });
  } catch (error) {
    console.error("Get work log error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch work log",
      error: error.message,
    });
  }
};

// Approve / Reject work log
export const updateWorkLogStatus = async (req, res) => {
  try {
    const { workLogId } = req.params;
    const { status, buyer_comment } = req.body;
    const profileId = req.user.profileId;

    const workLog = await WorkLog.getById(workLogId);
    if (!workLog) {
      return res.status(404).json({
        success: false,
        message: "Work log not found",
      });
    }

    const contract = await Contract.getById(workLog.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Associated contract not found",
      });
    }

    // Only buyer (or admin) can approve / reject using buyer_profile_id
    if (
      contract.buyer_profile_id !== profileId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can approve or reject work logs",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'approved' or 'rejected'",
      });
    }

    const updated = await WorkLog.updateStatus(workLogId, {
      status,
      buyer_comment: buyer_comment || null,
    });

    return res.json({
      success: true,
      message: `Work log ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error("Update work log status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update work log status",
      error: error.message,
    });
  }
};

export const updateWorkLogContent = async (req, res) => {
  try {
    const { workLogId } = req.params;
    const profileId = req.user.profileId;
    const { description, checklist, problems_faced, evidence } = req.body;

    const workLog = await WorkLog.getById(workLogId);
    if (!workLog) {
      return res.status(404).json({
        success: false,
        message: 'Work log not found',
      });
    }

    const contract = await Contract.getById(workLog.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: 'Associated contract not found',
      });
    }

    // Only expert who owns the contract (or admin) using expert_profile_id
    if (
      contract.expert_profile_id !== profileId &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own work logs',
      });
    }

    // Only allow editing submitted logs
    if (workLog.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Only submitted logs can be edited',
      });
    }

    const updated = await WorkLog.update(workLogId, {
      description,
      checklist,
      problems_faced,
      evidence,
    });

    return res.json({
      success: true,
      message: 'Work log updated',
      data: updated,
    });
  } catch (error) {
    console.error('Update work log content error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update work log',
      error: error.message,
    });
  }
};

export const finishSprint = async (req, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user.profileId;

    const contract = await Contract.getById(id);
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    // Only sprint contracts
    if (contract.engagement_model !== "sprint") {
      return res.status(400).json({
        success: false,
        message: "Only sprint contracts can finish a sprint",
      });
    }

    // Only buyer (or admin) can finish sprint using buyer_profile_id
    if (
      contract.buyer_profile_id !== profileId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can finish the sprint",
      });
    }

    const paymentTerms =
      typeof contract.payment_terms === "string"
        ? JSON.parse(contract.payment_terms)
        : contract.payment_terms || {};

    const currentSprint =
      typeof paymentTerms.current_sprint_number === "number"
        ? paymentTerms.current_sprint_number
        : 1;

    const updatedPaymentTerms = {
      ...paymentTerms,
      current_sprint_number: currentSprint + 1,
      sprint_start_date: new Date().toISOString(),
    };

    const updatedContract = await Contract.updatePaymentTerms(id, updatedPaymentTerms);

    return res.json({
      success: true,
      message: "Sprint finished and next sprint started",
      data: updatedContract,
    });
  } catch (error) {
    console.error("Finish sprint error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to finish sprint",
      error: error.message,
    });
  }
};

// Helper function to validate work log based on engagement model
function validateWorkLogByModel(engagementModel, type, checklist) {
  switch (engagementModel) {
    case "daily":
      if (type !== "daily_log") {
        return "Daily contracts must submit daily_log type";
      }
      break;

    case "sprint":
      if (type !== "sprint_submission") {
        return "Sprint contracts must submit sprint_submission type";
      }
      if (!checklist || !Array.isArray(checklist) || checklist.length === 0) {
        return "Checklist is required for sprint submissions";
      }
      break;

    case "fixed":
      if (type !== "milestone_request") {
        return "Fixed contracts must submit milestone_request type";
      }
      break;

    default:
      return "Invalid engagement model";
  }

  return null;
}

export default {
  createWorkLog,
  getWorkLogsByContract,
  getMyWorkLogs,
  getWorkLogById,
  updateWorkLogStatus,
  finishSprint,
  validateWorkLog,
  updateWorkLogContent,
};
