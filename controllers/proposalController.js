import { body, validationResult } from "express-validator";
import Proposal from "../models/proposalModel.js";
import pool from "../config/db.js";

// Validation middleware
export const validateProposal = [
  body("project_id").isUUID().withMessage("Valid project ID is required"),
  body("engagement_model")
    .isIn(["daily", "sprint", "fixed"])
    .withMessage("Engagement model must be daily, sprint, or fixed"),
  body("rate")
    .isFloat({ min: 0 })
    .withMessage("Rate must be a positive number"),
  body("duration_days")
    .isInt({ min: 1 })
    .withMessage("Duration must be at least 1 day"),
  body("quote_amount")
    .isFloat({ min: 0 })
    .withMessage("Quote amount must be positive"),
  body("message").optional().trim(),
];

// Create a new proposal
export const createProposal = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const expertProfileId = req.user.profileId;
    const {
      project_id,
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    } = req.body;

    // Verify project exists
    const projectCheck = await pool.query(
      "SELECT id, status FROM projects WHERE id = $1",
      [project_id]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate sprint_count for sprint model
    if (engagement_model === "sprint" && (!sprint_count || sprint_count < 1)) {
      return res.status(400).json({
        success: false,
        message:
          "Sprint count is required and must be at least 1 for sprint model",
      });
    }

    // Create proposal using expert_profile_id
    const proposal = await Proposal.create({
      project_id,
      expert_profile_id: expertProfileId,
      engagement_model,
      rate,
      duration_days,
      sprint_count: sprint_count || null,
      quote_amount,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Proposal created successfully",
      data: proposal,
    });
  } catch (error) {
    console.error("Create proposal error:", error);
    const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(status).json({
      success: false,
      message: status === 409 ? (error.message || 'Proposal already exists') : "Failed to create proposal",
      error: error.message,
    });
  }
};

// Get all proposals for a project
export const getProposalsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    const proposals = await Proposal.getByProjectId(projectId);

    res.status(200).json({
      success: true,
      data: proposals,
    });
  } catch (error) {
    console.error("Get proposals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch proposals",
      error: error.message,
    });
  }
};

// Get all proposals by current expert
export const getMyProposals = async (req, res) => {
  try {
    const expertProfileId = req.user.profileId;

    const proposals = await Proposal.getByExpertProfileId(expertProfileId);

    res.status(200).json({
      success: true,
      data: proposals,
    });
  } catch (error) {
    console.error("Get my proposals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch proposals",
      error: error.message,
    });
  }
};

// Get single proposal by ID
export const getProposalById = async (req, res) => {
  try {
    const { proposalId } = req.params;

    const proposal = await Proposal.getById(proposalId);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: "Proposal not found",
      });
    }

    res.status(200).json({
      success: true,
      data: proposal,
    });
  } catch (error) {
    console.error("Get proposal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch proposal",
      error: error.message,
    });
  }
};

// Update proposal (expert only)
export const updateProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const expertProfileId = req.user.profileId;
    const updates = req.body;

    const proposal = await Proposal.getById(proposalId);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: "Proposal not found",
      });
    }

    // Verify expert owns this proposal using expert_profile_id
    if (proposal.expert_profile_id !== expertProfileId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own proposals",
      });
    }

    // Prevent updating if proposal is accepted
    if (proposal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a proposal that is not pending",
      });
    }

    const updatedProposal = await Proposal.update(proposalId, updates);

    res.status(200).json({
      success: true,
      message: "Proposal updated successfully",
      data: updatedProposal,
    });
  } catch (error) {
    console.error("Update proposal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update proposal",
      error: error.message,
    });
  }
};

// Withdraw/Delete proposal (expert only)
export const withdrawProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const expertProfileId = req.user.profileId;

    const proposal = await Proposal.getById(proposalId);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: "Proposal not found",
      });
    }

    // Verify expert owns this proposal using expert_profile_id
    if (proposal.expert_profile_id !== expertProfileId) {
      return res.status(403).json({
        success: false,
        message: "You can only withdraw your own proposals",
      });
    }

    // Prevent withdrawing if proposal is already accepted
    if (proposal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot withdraw a proposal that is not pending",
      });
    }

    await Proposal.delete(proposalId);

    res.status(200).json({
      success: true,
      message: "Proposal withdrawn successfully",
    });
  } catch (error) {
    console.error("Withdraw proposal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to withdraw proposal",
      error: error.message,
    });
  }
};

// Reject proposal (buyer only)
export const rejectProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const buyerProfileId = req.user.profileId;

    const proposal = await Proposal.getById(proposalId);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: "Proposal not found",
      });
    }

    // Verify buyer owns the project this proposal is for
    const projectCheck = await pool.query(
      `SELECT buyer_profile_id FROM projects WHERE id = $1`,
      [proposal.project_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (String(projectCheck.rows[0].buyer_profile_id) !== String(buyerProfileId)) {
      return res.status(403).json({
        success: false,
        message: "You can only reject proposals on your own projects",
      });
    }

    // Prevent rejecting if proposal is not pending
    if (proposal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot reject a proposal that is not pending",
      });
    }

    // Update proposal status to rejected
    await pool.query(
      `UPDATE proposals SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [proposalId]
    );

    res.status(200).json({
      success: true,
      message: "Proposal rejected successfully",
      data: { proposalId, projectId: proposal.project_id },
    });
  } catch (error) {
    console.error("Reject proposal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject proposal",
      error: error.message,
    });
  }
};

export default {
  createProposal,
  getProposalsByProject,
  getMyProposals,
  getProposalById,
  updateProposal,
  withdrawProposal,
  rejectProposal,
  validateProposal,
};
