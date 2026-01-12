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
    const expertProfileId = req.user.profileId;

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

    const workDate = new Date(work_date);
    const today = new Date();
    const workDayStart = new Date(workDate.getFullYear(), workDate.getMonth(), workDate.getDate());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (workDayStart.getTime() === todayStart.getTime()) {
      // Check if already submitted for TODAY
      const todaySummary = await DayWorkSummary.getByContractAndDate(contract_id, work_date);
      if (todaySummary) {
        return res.status(400).json({
          success: false,
          message: "You can only submit one work summary per calendar day",
        });
      }
    }

    // Create day work summary using expert_profile_id
    const summary = await DayWorkSummary.create({
      contract_id,
      expert_profile_id: expertProfileId,
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
    const profileId = req.user.profileId;

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

    // Check access using profile IDs
    if (
      contract.expert_profile_id !== profileId &&
      contract.buyer_profile_id !== profileId &&
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
    const profileId = req.user.profileId;

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

    // Only buyer (or admin) can approve/reject using buyer_profile_id
    if (contract.buyer_profile_id !== profileId && req.user.role !== "admin") {
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
          contract.expert_profile_id,
          contract.buyer_profile_id,
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
    const expertProfileId = req.user.profileId;

    const summaries = await DayWorkSummary.getByExpertProfileId(expertProfileId);

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
