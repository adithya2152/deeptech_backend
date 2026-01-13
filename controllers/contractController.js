import { body, validationResult } from "express-validator";
import Contract from "../models/contractModel.js";
import Invoice from "../models/invoiceModel.js";
import WorkLog from "../models/workLogModel.js";
import pool from "../config/db.js";

export const validateContractCreation = [
  body("expert_profile_id").isUUID().withMessage("Valid expert profile ID is required"),
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

export const createContract = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const buyerProfileId = req.user.profileId;
    const {
      expert_profile_id,
      project_id,
      engagement_model,
      payment_terms,
      start_date,
    } = req.body;

    if (expert_profile_id === buyerProfileId) {
      return res.status(400).json({
        success: false,
        message: "You cannot create a contract with yourself",
        code: "SELF_CONTRACT_NOT_ALLOWED",
      });
    }

    // Check project ownership using buyer_profile_id
    const projectCheck = await pool.query(
      "SELECT id, buyer_profile_id FROM projects WHERE id = $1",
      [project_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (projectCheck.rows[0].buyer_profile_id !== buyerProfileId) {
      return res.status(403).json({
        success: false,
        message: "You can only create contracts for your own projects",
      });
    }

    if (!validatePaymentTerms(engagement_model, payment_terms)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment_terms structure for ${engagement_model} model`,
      });
    }

    const existingContract =
      await Contract.findActiveOrPendingForPair(project_id, expert_profile_id);

    if (existingContract) {
      return res.status(400).json({
        success: false,
        message:
          "A contract already exists between this buyer and expert for this project.",
      });
    }

    const contract = await Contract.createContract({
      project_id,
      buyer_profile_id: buyerProfileId,
      expert_profile_id,
      engagement_model,
      payment_terms,
      start_date,
    });

    // Update proposals using expert_profile_id
    await pool.query(
      "UPDATE proposals SET status = $1, updated_at = NOW() WHERE project_id = $2 AND expert_profile_id = $3 AND status = $4",
      ["accepted", project_id, expert_profile_id, "pending"]
    );

    await pool.query(
      "UPDATE proposals SET status = $1, updated_at = NOW() WHERE project_id = $2 AND expert_profile_id <> $3 AND status = $4",
      ["rejected", project_id, expert_profile_id, "pending"]
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

export const acceptAndSignNda = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contractId } = req.params;
    const expertProfileId = req.user.profileId;
    const { signature_name } = req.body;
    const ipAddress =
      req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (contract.expert_profile_id !== expertProfileId) {
      return res.status(403).json({
        success: false,
        message: "You can only sign contracts assigned to you",
      });
    }

    if (contract.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Contract is not in pending status",
      });
    }

    if (contract.nda_signed_at !== null) {
      return res.status(400).json({
        success: false,
        message: "NDA is already signed for this contract",
      });
    }

    const activatedContract = await Contract.signNdaAndActivate(
      contractId,
      signature_name,
      ipAddress
    );

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

export const updateNda = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { nda_custom_content, nda_status } = req.body;
    const buyerProfileId = req.user.profileId;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    if (contract.buyer_profile_id !== buyerProfileId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (contract.nda_status === "signed") {
      return res.status(400).json({ message: "NDA already signed" });
    }

    const updated = await Contract.updateNda(
      contractId,
      nda_custom_content,
      nda_status || "sent"
    );

    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getContractById = async (req, res) => {
  try {
    const { contractId } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    const contract = await Contract.getContractWithDetails(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (
      contract.buyer_profile_id !== profileId &&
      contract.expert_profile_id !== profileId &&
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

export const getMyContracts = async (req, res) => {
  try {
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    let contracts = [];

    if (userRole === "expert" || userRole === "buyer") {
      contracts = await Contract.getContractsByUser(profileId, userRole);
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

export const declineContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const userProfileId = req.user.profileId;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    // Allow both buyer (who created the offer) and expert (who received it) to decline
    const isExpert = String(contract.expert_profile_id) === String(userProfileId);
    const isBuyer = String(contract.buyer_profile_id) === String(userProfileId);

    if (!isExpert && !isBuyer) {
      return res.status(403).json({
        success: false,
        message: "You can only decline contracts you are party to",
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

    await pool.query(
      `
      UPDATE proposals
      SET status = 'pending', updated_at = NOW()
      WHERE project_id = $1
        AND expert_profile_id = $2
      `,
      [contract.project_id, contract.expert_profile_id]
    );

    res.status(200).json({
      success: true,
      message: "Contract declined successfully",
      data: { contractId, projectId: contract.project_id },
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

export const getContractInvoices = async (req, res) => {
  try {
    const { contractId } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (
      contract.buyer_profile_id !== profileId &&
      contract.expert_profile_id !== profileId &&
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

function validatePaymentTerms(engagementModel, paymentTerms) {
  switch (engagementModel) {
    case "daily":
      return (
        typeof paymentTerms.daily_rate === "number" &&
        typeof paymentTerms.total_days === "number"
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

export const fundEscrow = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { amount } = req.body;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (contract.buyer_profile_id !== profileId && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can fund escrow",
      });
    }

    const updatedContract = await Contract.fundEscrow(contractId, amount);

    return res.status(200).json({
      success: true,
      message: "Escrow funded successfully",
      data: updatedContract,
    });
  } catch (error) {
    console.error("Fund escrow error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fund escrow",
      error: error.message,
    });
  }
};

export const completeContract = async (req, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    const contract = await Contract.getById(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (String(contract.buyer_profile_id) !== String(profileId) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can complete the contract",
      });
    }

    if (contract.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Only active contracts can be completed",
      });
    }

    if (contract.engagement_model === "fixed") {
      try {
        const paymentTerms =
          typeof contract.payment_terms === "string"
            ? JSON.parse(contract.payment_terms)
            : contract.payment_terms || {};

        const finalInvoice = await Invoice.createFinalFixed({
          contractId: id,
          expertProfileId: contract.expert_profile_id,
          buyerProfileId: contract.buyer_profile_id,
          paymentTerms: paymentTerms,
        });

        if (finalInvoice) {
          // Automatically pay the invoice
          await Invoice.payInvoice(finalInvoice.id);
          // Release funds from escrow
          await Contract.releaseEscrow(id, finalInvoice.amount);
        }

      } catch (invoiceError) {
        console.error("Final invoice creation/payment error:", invoiceError);
      }
    }

    const updatedContract = await Contract.updateStatus(id, "completed");

    // Auto-complete the project when contract is completed
    await pool.query(
      `UPDATE projects SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [contract.project_id]
    );

    return res.status(200).json({
      success: true,
      message: "Contract completed successfully",
      data: updatedContract,
    });
  } catch (error) {
    console.error("Complete contract error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete contract",
      error: error.message,
    });
  }
};

export const finishSprint = async (req, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    const contract = await Contract.getById(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (contract.engagement_model !== "sprint") {
      return res.status(400).json({
        success: false,
        message: "Only sprint contracts can finish a sprint",
      });
    }

    if (contract.buyer_profile_id !== profileId && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can finish the sprint",
      });
    }

    if (contract.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Contract must be active to finish a sprint",
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

    const totalSprints = paymentTerms.total_sprints || 1;

    const approvedCount = await WorkLog.countApprovedSprintSubmissions(
      id,
      currentSprint
    );

    if (approvedCount < 1) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot finish sprint without at least one approved work log in the current sprint",
        code: "SPRINT_NO_APPROVED_LOGS",
      });
    }

    try {
      await Invoice.createFromSprint(
        id,
        contract.expert_profile_id,
        contract.buyer_profile_id,
        paymentTerms,
        currentSprint
      );
    } catch (invoiceError) {
      console.error("Sprint invoice creation error:", invoiceError);
    }

    let updatedContract = contract;

    if (currentSprint < totalSprints) {
      const updatedPaymentTerms = {
        ...paymentTerms,
        current_sprint_number: currentSprint + 1,
        sprint_start_date: new Date().toISOString(),
      };

      updatedContract = await Contract.updatePaymentTerms(
        id,
        updatedPaymentTerms
      );
    }
    const finalContractState = await Contract.getById(id);

    return res.json({
      success: true,
      message: currentSprint < totalSprints
        ? "Sprint finished and next sprint started"
        : "Final sprint finished. Invoice generated.",
      data: finalContractState,
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

export const submitFeedback = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { rating, comment } = req.body;
    const giverProfileId = req.user.profileId;

    const contract = await Contract.getById(contractId);
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });

    if (contract.status !== "completed") {
      return res.status(400).json({ success: false, message: "Contract must be completed to leave a review" });
    }

    let receiverProfileId;
    let receiverRole;
    if (giverProfileId === contract.buyer_profile_id) {
      receiverProfileId = contract.expert_profile_id;
      receiverRole = 'expert';
    } else if (giverProfileId === contract.expert_profile_id) {
      receiverProfileId = contract.buyer_profile_id;
      receiverRole = 'buyer';
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const exists = await Contract.checkFeedbackExists(contractId, giverProfileId);

    if (exists) {
      return res.status(400).json({ success: false, message: "Feedback already submitted" });
    }

    const feedback = await Contract.createFeedback(
      contractId,
      giverProfileId,
      receiverProfileId,
      rating,
      comment,
      rating >= 4,
      receiverRole
    );

    if (receiverRole === 'expert') {
      await Contract.updateExpertRating(receiverProfileId);
    }

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    console.error("Submit feedback error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getContractFeedback = async (req, res) => {
  try {
    const { contractId } = req.params;
    const feedback = await Contract.getFeedbackByContractId(contractId);
    res.status(200).json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  createContract,
  acceptAndSignNda,
  getContractById,
  getMyContracts,
  getProjectContracts,
  declineContract,
  getContractInvoices,
  fundEscrow,
  completeContract,
  finishSprint,
  validateContractCreation,
  validateNdaSigning,
  updateNda,
  submitFeedback,
  getContractFeedback
};