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

    const { contract_id, type, checklist, problems_faced, sprint_number } =
      req.body;

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

    // Verify expert owns this contract
    if (contract.expert_id !== req.user.id) {
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
      parsedChecklist,
      sprint_number
    );

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    // For daily logs: check 24-hour submission limit
    if (type === "daily_log" && contract.engagement_model === "daily") {
      const recentLogs = await WorkLog.getRecentDailyLogs(contract_id);
      if (recentLogs.length > 0) {
        return res.status(400).json({
          success: false,
          message: "You can only submit one daily log per 24-hour period",
        });
      }
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
      // If evidence is provided as JSON
      evidence =
        typeof req.body.evidence === "string"
          ? JSON.parse(req.body.evidence)
          : req.body.evidence;
    }

    // Create work log
    const workLog = await WorkLog.create({
      contract_id,
      type,
      checklist: parsedChecklist,
      problems_faced,
      sprint_number: sprint_number ? parseInt(sprint_number) : null,
      evidence,
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
    const userId = req.user.id;

    // Get contract to verify access
    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Check access: expert, buyer, or admin
    if (
      contract.expert_id !== userId &&
      contract.buyer_id !== userId &&
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
    const expertId = req.user.id;

    const workLogs = await WorkLog.getByExpertId(expertId);

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
    const userId = req.user.id;

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

    // Check access
    if (
      contract.expert_id !== userId &&
      contract.buyer_id !== userId &&
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

// Helper function to validate work log based on engagement model
function validateWorkLogByModel(
  engagementModel,
  type,
  checklist,
  sprintNumber
) {
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
      if (!sprintNumber || sprintNumber < 1) {
        return "Sprint number is required and must be at least 1";
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
  validateWorkLog,
};
