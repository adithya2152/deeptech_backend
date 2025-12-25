import { body, validationResult } from "express-validator";
import Contract from "../models/contractModel.js";
import Proposal from "../models/proposalModel.js";
import pool from "../config/db.js";

// Validation middleware
export const validateContractCreation = [
  body("expert_id").isUUID().withMessage("Valid expert ID is required"),
  body("project_id").isUUID().withMessage("Valid project ID is required"),
  body("engagement_model")
    .isIn(["daily", "sprint", "fixed"])
    .withMessage("Engagement model must be daily, sprint, or fixed"),
  body("payment_terms")
    .isObject()
    .withMessage("Payment terms must be an object"),
  body("start_date").isISO8601().withMessage("Valid start date is required"),
];

export const validateNdaSigning = [
  body("signature_name")
    .notEmpty()
    .trim()
    .withMessage("Signature name is required"),
];

// Create a new contract (Buyer hires Expert)
export const createContract = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const buyerId = req.user.id;
    const {
      expert_id,
      project_id,
      engagement_model,
      payment_terms,
      start_date,
    } = req.body;

    // Verify project exists and user owns it
    const projectCheck = await pool.query(
      "SELECT id, buyer_id FROM projects WHERE id = $1",
      [project_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (projectCheck.rows[0].buyer_id !== buyerId) {
      return res.status(403).json({
        success: false,
        message: "You can only create contracts for your own projects",
      });
    }

    // Validate payment_terms structure
    if (!validatePaymentTerms(engagement_model, payment_terms)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment_terms structure for ${engagement_model} model`,
      });
    }

    // ✅ Check if a non-final contract already exists for this project + expert
    const existingContract =
      await Contract.findActiveOrPendingForPair(project_id, expert_id);

    if (existingContract) {
      return res.status(400).json({
        success: false,
        message:
          "A contract already exists between this buyer and expert for this project.",
      });
    }

    // Create contract
    const contract = await Contract.createContract({
      project_id,
      buyer_id: buyerId,
      expert_id,
      engagement_model,
      payment_terms,
      start_date,
    });

    // Update proposal status if exists
    await pool.query(
      "UPDATE proposals SET status = $1, updated_at = NOW() WHERE project_id = $2 AND expert_id = $3 AND status = $4",
      ["accepted", project_id, expert_id, "pending"]
    );

    res.status(201).json({
      success: true,
      message:
        "Contract created successfully. Expert needs to sign NDA to activate.",
      data: contract,
    });
  } catch (error) {
    console.error("Create contract error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create contract",
      error: error.message,
    });
  }
};

// Accept contract and sign NDA (Expert only)
export const acceptAndSignNda = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contractId } = req.params;
    const expertId = req.user.id;
    const { signature_name } = req.body;
    const ipAddress =
      req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    // Get contract
    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Verify expert is the one on the contract
    if (contract.expert_id !== expertId) {
      return res.status(403).json({
        success: false,
        message: "You can only sign contracts assigned to you",
      });
    }

    // Verify contract is in pending status
    if (contract.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Contract is not in pending status",
      });
    }

    // Verify NDA is not already signed
    if (contract.nda_signed_at !== null) {
      return res.status(400).json({
        success: false,
        message: "NDA is already signed for this contract",
      });
    }

    // Sign NDA and activate contract
    const activatedContract = await Contract.signNdaAndActivate(
      contractId,
      signature_name,
      ipAddress
    );

    // Update project status to active
    await pool.query("UPDATE projects SET status = $1 WHERE id = $2", [
      "active",
      contract.project_id,
    ]);

    res.status(200).json({
      success: true,
      message: "NDA signed successfully. Contract is now active.",
      data: activatedContract,
    });
  } catch (error) {
    console.error("Accept contract error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept contract and sign NDA",
      error: error.message,
    });
  }
};

// Get contract by ID
export const getContractById = async (req, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const contract = await Contract.getContractWithDetails(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Check access: buyer or expert or admin
    if (
      contract.buyer_id !== userId &&
      contract.expert_id !== userId &&
      userRole !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this contract",
      });
    }

    res.status(200).json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error("Get contract error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contract",
      error: error.message,
    });
  }
};

// Get all contracts for current user
export const getMyContracts = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let contracts = [];

    if (userRole === "expert" || userRole === "buyer") {
      contracts = await Contract.getContractsByUser(userId, userRole);
    } else if (userRole === "admin") {
      const result = await pool.query(
        "SELECT * FROM contracts ORDER BY created_at DESC"
      );
      contracts = result.rows;
    }

    res.status(200).json({
      success: true,
      data: contracts,
    });
  } catch (error) {
    console.error("Get my contracts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contracts",
      error: error.message,
    });
  }
};

// Get all contracts for a project
export const getProjectContracts = async (req, res) => {
  try {
    const { projectId } = req.params;

    const contracts = await Contract.getByProjectId(projectId);

    res.status(200).json({
      success: true,
      data: contracts,
    });
  } catch (error) {
    console.error("Get project contracts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contracts",
      error: error.message,
    });
  }
};

// Decline contract (Expert only)
export const declineContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const expertId = req.user.id;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (contract.expert_id !== expertId) {
      return res.status(403).json({
        success: false,
        message: "You can only decline contracts assigned to you",
      });
    }

    if (contract.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Can only decline pending contracts",
      });
    }

    await pool.query("UPDATE contracts SET status = $1 WHERE id = $2", [
      "declined",
      contractId,
    ]);

    res.status(200).json({
      success: true,
      message: "Contract declined successfully",
    });
  } catch (error) {
    console.error("Decline contract error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to decline contract",
      error: error.message,
    });
  }
};

// Get invoices for a contract (buyer or expert on that contract)
export const getContractInvoices = async (req, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Access control: buyer, expert, or admin
    if (
      contract.buyer_id !== userId &&
      contract.expert_id !== userId &&
      userRole !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this contract's invoices",
      });
    }

    const invoices = await Contract.getInvoices(contractId);

    return res.status(200).json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    console.error("Get contract invoices error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch contract invoices",
      error: error.message,
    });
  }
};

// Helper function to validate payment terms structure
function validatePaymentTerms(engagementModel, paymentTerms) {
  switch (engagementModel) {
    case "daily":
      return (
        paymentTerms.daily_rate && typeof paymentTerms.daily_rate === "number"
      );
    case "sprint":
      return (
        paymentTerms.sprint_rate &&
        paymentTerms.sprint_duration_days &&
        paymentTerms.total_sprints &&
        typeof paymentTerms.sprint_rate === "number"
      );
    case "fixed":
      return (
        paymentTerms.total_amount &&
        typeof paymentTerms.total_amount === "number"
      );
    default:
      return false;
  }
}

export default {
  createContract,
  acceptAndSignNda,
  getContractById,
  getMyContracts,
  getProjectContracts,
  declineContract,
  getContractInvoices,
  validateContractCreation,
  validateNdaSigning,
};
