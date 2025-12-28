import { body, validationResult } from "express-validator";
import DayWorkSummary from "../models/dayWorkSummaryModel.js";
import Contract from "../models/contractModel.js";
import Invoice from "../models/invoiceModel.js";

// Validation middleware
export const validateDayWorkSummary = [
  body("contract_id").isUUID().withMessage("Valid contract ID is required"),
  body("work_date").isISO8601().withMessage("Valid work date is required"),
  body("total_hours")
    .isFloat({ min: 0, max: 24 })
    .withMessage("Total hours must be between 0 and 24"),
];

// Create a new day work summary (Expert only)
export const createDayWorkSummary = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contract_id, work_date, total_hours } = req.body;
    const expertId = req.user.id;

    // Get contract
    const contract = await Contract.getById(contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Verify expert owns this contract
    if (contract.expert_id !== expertId) {
      return res.status(403).json({
        success: false,
        message: "You can only submit work summaries for your own contracts",
      });
    }

    // Verify contract is active
    if (contract.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Contract must be active to submit work summaries",
      });
    }

    // Verify contract is daily engagement model
    if (contract.engagement_model !== "daily") {
      return res.status(400).json({
        success: false,
        message:
          "Only daily engagement contracts can submit day work summaries",
      });
    }

    // Check for recent submissions (24-hour limit)
    const recentSummaries = await DayWorkSummary.getRecentForContract(
      contract_id,
      24
    );
    if (recentSummaries.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You can only submit one work summary per 24-hour period",
      });
    }

    // Create day work summary
    const summary = await DayWorkSummary.create({
      contract_id,
      expert_id: expertId,
      work_date,
      total_hours,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Day work summary submitted successfully",
      data: summary,
    });
  } catch (error) {
    console.error("Create day work summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create day work summary",
      error: error.message,
    });
  }
};

// Get all day work summaries for a contract
export const getDayWorkSummariesByContract = async (req, res) => {
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
        message: "You do not have access to these work summaries",
      });
    }

    // Get summaries
    const summaries = await DayWorkSummary.getByContractId(contractId);

    res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Get day work summaries error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch day work summaries",
      error: error.message,
    });
  }
};

// Get day work summary by ID
export const getDayWorkSummaryById = async (req, res) => {
  try {
    const { summaryId } = req.params;
    const userId = req.user.id;

    const summary = await DayWorkSummary.getById(summaryId);
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Day work summary not found",
      });
    }

    // Get contract to verify access
    const contract = await Contract.getById(summary.contract_id);
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
        message: "You do not have access to this work summary",
      });
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Get day work summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch day work summary",
      error: error.message,
    });
  }
};

// Approve or Reject day work summary (Buyer or Admin only)
export const updateDayWorkSummaryStatus = async (req, res) => {
  try {
    const { summaryId } = req.params;
    const { status, reviewer_comment } = req.body;
    const userId = req.user.id;

    const summary = await DayWorkSummary.getById(summaryId);
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Day work summary not found",
      });
    }

    const contract = await Contract.getById(summary.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Associated contract not found",
      });
    }

    // Only buyer (or admin) can approve/reject
    if (contract.buyer_id !== userId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can approve or reject work summaries",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'approved' or 'rejected'",
      });
    }

    // Update status
    const updated = await DayWorkSummary.updateStatus(
      summaryId,
      status,
      reviewer_comment || null
    );

    // If approved, create invoice automatically
    if (status === "approved") {
      try {
        const paymentTerms =
          typeof contract.payment_terms === "string"
            ? JSON.parse(contract.payment_terms)
            : contract.payment_terms || {};

        const invoice = await Invoice.createFromDailyLog(
          summaryId,
          contract.id,
          contract.expert_id,
          contract.buyer_id,
          paymentTerms,
          summary.work_date,
          summary.total_hours
        );

        return res.json({
          success: true,
          message: `Day work summary ${status} and invoice created`,
          data: {
            summary: updated,
            invoice: invoice,
          },
        });
      } catch (invoiceError) {
        console.error("Invoice creation error:", invoiceError);
        // Still return success for approval, but note invoice issue
        return res.json({
          success: true,
          message: `Day work summary ${status} but invoice creation failed`,
          data: {
            summary: updated,
            invoiceError: invoiceError.message,
          },
        });
      }
    }

    return res.json({
      success: true,
      message: `Day work summary ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error("Update day work summary status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update day work summary status",
      error: error.message,
    });
  }
};

// Get my day work summaries (Expert only)
export const getMyDayWorkSummaries = async (req, res) => {
  try {
    const expertId = req.user.id;

    const summaries = await DayWorkSummary.getByExpertId(expertId);

    res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Get my day work summaries error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch day work summaries",
      error: error.message,
    });
  }
};

export default {
  createDayWorkSummary,
  getDayWorkSummariesByContract,
  getDayWorkSummaryById,
  updateDayWorkSummaryStatus,
  getMyDayWorkSummaries,
  validateDayWorkSummary,
};
