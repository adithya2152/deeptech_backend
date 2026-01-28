import { body, validationResult } from "express-validator";
import Contract from "../models/contractModel.js";
import Invoice from "../models/invoiceModel.js";
import WorkLog from "../models/workLogModel.js";
import pool from "../config/db.js";
import { generateContractServiceAgreement } from "./contractDocumentController.js";
import {
  notifyExpertContractReceived,
  notifyBuyerContractAccepted,
  notifyBuyerWorkCompleted,
  notifyExpertProposalAccepted,
  notifyContractSigned
} from "./notificationController.js";


/**
 * Internal helper to auto-activate contract if criteria met.
 */
const checkAndAutoActivate = async (contractId) => {
  try {
    const contract = await Contract.getById(contractId);
    if (!contract) return;

    // 1. Must be fully signed
    if (!contract.buyer_signed_at || !contract.expert_signed_at) return;

    // 2. NDA must be resolved (signed, skipped, or not required)
    // 2. NDA must be resolved (signed or skipped)
    // If status is 'draft', 'pending', or 'sent', DO NOT ACTIVATE.
    if (!contract.nda_status || ['draft', 'pending', 'sent'].includes(contract.nda_status)) return;

    // 3. Must NOT be 'fixed' (Fixed requires funding)
    if (contract.engagement_model === 'fixed') return;

    // 4. Must be 'pending'
    if (contract.status !== 'pending') return;

    // ACTIVATE
    await Contract.activateContract(contractId);

    // Update Project Status
    await pool.query("UPDATE projects SET status = 'active' WHERE id = $1", [contract.project_id]);

    console.log(`Auto-activated contract ${contractId}`);
  } catch (e) {
    console.error("Auto-activation failed:", e);
  }
};

export const validateContractCreation = [
  body("expert_profile_id").isUUID().withMessage("Valid expert profile ID is required"),
  body("project_id").isUUID().withMessage("Valid project ID is required"),
  body("engagement_model")
    .isIn(["daily", "sprint", "fixed", "hourly"])
    .withMessage("Engagement model must be daily, sprint, fixed, or hourly"),
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
      "SELECT id, buyer_profile_id, currency FROM projects WHERE id = $1",
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

    const projectCurrency = String(projectCheck.rows[0].currency || 'INR').toUpperCase();

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

    // Ensure payment_terms currency is set and aligned with project currency.
    const normalizedPaymentTerms = { ...(payment_terms || {}) };
    normalizedPaymentTerms.currency = projectCurrency;

    const contract = await Contract.createContract({
      project_id,
      buyer_profile_id: buyerProfileId,
      expert_profile_id,
      engagement_model,
      payment_terms: normalizedPaymentTerms,
      start_date,
      currency: projectCurrency,
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

    // Auto-generate service agreement for the contract
    try {
      await generateContractServiceAgreement(contract.id);
    } catch (docError) {
      console.error("Failed to generate service agreement:", docError);
      // Don't fail the contract creation, document can be regenerated
    }

    // Notify expert about new contract offer
    try {
      const { rows: notifyData } = await pool.query(`
        SELECT p.title, u.first_name, u.last_name
        FROM projects p
        JOIN profiles prof ON prof.id = $1
        JOIN user_accounts u ON u.id = prof.user_id
        WHERE p.id = $2
      `, [buyerProfileId, project_id]);

      if (notifyData.length > 0) {
        const { title, first_name, last_name } = notifyData[0];
        const buyerName = `${first_name} ${last_name}`.trim();
        await notifyExpertContractReceived(expert_profile_id, buyerName, title, contract.id);
        // Also notify expert their proposal was accepted
        await notifyExpertProposalAccepted(expert_profile_id, title, project_id);
      }
    } catch (notifyErr) {
      console.error('Failed to send contract notification:', notifyErr);
    }

    res.status(201).json({
      success: true,
      message:
        "Contract created successfully. Both parties need to sign the service agreement to activate.",
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

export const signContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const profileId = req.user.profileId;
    const { signature_name } = req.body;

    if (!signature_name) {
      return res.status(400).json({ success: false, message: "Signature name is required" });
    }

    const contract = await Contract.getById(contractId);
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });

    let role = null;
    if (contract.expert_profile_id === profileId) role = 'expert';
    else if (contract.buyer_profile_id === profileId) role = 'buyer';
    else return res.status(403).json({ success: false, message: "Unauthorized: You are not a party to this contract" });

    if (contract.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Contract is not pending" });
    }

    if (role === 'expert' && contract.expert_signed_at) {
      return res.status(400).json({ success: false, message: "You have already signed this contract" });
    }
    if (role === 'buyer' && contract.buyer_signed_at) {
      return res.status(400).json({ success: false, message: "You have already signed this contract" });
    }

    const updated = await Contract.signContract(contractId, role, signature_name);

    // Notify logic
    try {
      const otherPartyId = role === 'expert' ? contract.buyer_profile_id : contract.expert_profile_id;

      // Fetch signer name
      const { rows: signerData } = await pool.query(
        `SELECT first_name, last_name FROM user_accounts JOIN profiles ON profiles.user_id = user_accounts.id WHERE profiles.id = $1`,
        [profileId]
      );
      const signerName = signerData[0] ? `${signerData[0].first_name} ${signerData[0].last_name}` : "User";

      // Check if fully signed
      const isFullySigned = !!(updated.buyer_signed_at && updated.expert_signed_at);

      // Fetch Project Title
      const { rows: projectData } = await pool.query(`SELECT title FROM projects WHERE id = $1`, [contract.project_id]);
      const projectTitle = projectData[0]?.title || "Project";

      await notifyContractSigned(otherPartyId, signerName, projectTitle, contractId, isFullySigned);
    } catch (e) { console.error("Notify error", e); }

    // await checkAndAutoActivate(contractId); // Disable auto-activation
    const finalContract = await Contract.getById(contractId);

    res.json({ success: true, message: "Contract signed successfully", data: finalContract });
  } catch (e) {
    console.error("Sign contract error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const signNda = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contractId } = req.params;
    const profileId = req.user.profileId;
    const { signature_name } = req.body;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    const contract = await Contract.getById(contractId);
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });

    if (contract.expert_profile_id !== profileId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Expert must have accepted offer first?
    if (!contract.offer_accepted_at) {
      // Optional: Enforce offer acceptance first
      // return res.status(400).json({ message: "Must accept offer first" });
    }

    await Contract.signNda(contractId, signature_name, ipAddress);
    // await checkAndAutoActivate(contractId); // Disable auto-activation
    const finalContract = await Contract.getById(contractId);
    res.json({ success: true, message: "NDA signed", data: finalContract });
  } catch (e) {
    console.error("Sign NDA error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const activateContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    // Check permissions (Buyer or Expert? Usually Buyer activates after funding?)
    // Or if Expert signs NDA and Escrow is funded, system activates.
    // For now, let's allow either party if conditions met?
    // Or restricted to Buyer/System.

    // This endpoint forces activation.
    const contractToCheck = await Contract.getById(contractId);
    if (!contractToCheck) return res.status(404).json({ message: "Contract not found" });

    // Validate Escrow Funding
    // For Fixed, Sprint, and Daily models, we typically require full funding of the agreed amount before activation.
    // Hourly might be pay-as-you-go, so strict blocking might not apply (or require min deposit).
    if (contractToCheck.engagement_model !== 'hourly') {
      const balance = Number(contractToCheck.escrow_balance) || 0;
      const required = Number(contractToCheck.total_amount) || 0;

      // Allow a small epsilon for floating point issues, or just strict compare
      if (balance < required) {
        return res.status(400).json({
          success: false,
          message: `Insufficient escrow balance. Please fund escrow to activate.`
        });
      }
    }

    const updated = await Contract.activateContract(contractId);

    // Update Project Status
    await pool.query("UPDATE projects SET status = 'active' WHERE id = $1", [contractToCheck.project_id]);

    res.json({ success: true, message: "Contract activated", data: updated });
  } catch (e) {
    console.error("Activate contract error:", e);
    res.status(500).json({ success: false, message: e.message });
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

    await Contract.updateNda(
      contractId,
      nda_custom_content,
      nda_status || "sent"
    );

    // await checkAndAutoActivate(contractId); // Disable auto-activation
    const finalContract = await Contract.getById(contractId);

    res.json({ success: true, data: finalContract });
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

    // Backward-compatible derived contract value for UI (older rows may have total_amount=0)
    // NOTE: This does not mutate DB state; it only normalizes the API response.
    try {
      const paymentTerms =
        typeof contract.payment_terms === "string"
          ? JSON.parse(contract.payment_terms)
          : (contract.payment_terms || {});

      const currentTotal = Number(contract.total_amount) || 0;

      if ((contract.engagement_model === "hourly") && currentTotal <= 0) {
        const hourlyRate = Number(paymentTerms.hourly_rate || 0);
        const estimatedHours = Number(paymentTerms.estimated_hours || 0);
        if (hourlyRate > 0 && estimatedHours > 0) {
          contract.total_amount = hourlyRate * estimatedHours;
        }
      }

      if ((contract.engagement_model === "fixed") && currentTotal <= 0) {
        const fixedTotal = Number(paymentTerms.total_amount || 0);
        if (fixedTotal > 0) {
          contract.total_amount = fixedTotal;
        }
      }

      if ((contract.engagement_model === "daily") && currentTotal <= 0) {
        const rate = Number(paymentTerms.daily_rate || 0);
        const days = Number(paymentTerms.total_days || 0);
        if (rate > 0 && days > 0) {
          contract.total_amount = rate * days;
        }
      }

      if ((contract.engagement_model === "sprint") && currentTotal <= 0) {
        const sprintRate = Number(paymentTerms.sprint_rate || 0);
        const totalSprints = Number(paymentTerms.total_sprints || 0);
        if (sprintRate > 0 && totalSprints > 0) {
          contract.total_amount = sprintRate * totalSprints;
        }
      }
    } catch (e) {
      // If payment_terms is malformed, keep stored total_amount as-is.
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

    // Backward-compatible derived totals for lists
    contracts = (contracts || []).map((c) => {
      try {
        const paymentTerms =
          typeof c.payment_terms === "string"
            ? JSON.parse(c.payment_terms)
            : (c.payment_terms || {});

        const currentTotal = Number(c.total_amount) || 0;

        if (c.engagement_model === "hourly" && currentTotal <= 0) {
          const hourlyRate = Number(paymentTerms.hourly_rate || 0);
          const estimatedHours = Number(paymentTerms.estimated_hours || 0);
          if (hourlyRate > 0 && estimatedHours > 0) {
            c.total_amount = hourlyRate * estimatedHours;
          }
        }

        if (c.engagement_model === "fixed" && currentTotal <= 0) {
          const fixedTotal = Number(paymentTerms.total_amount || 0);
          if (fixedTotal > 0) {
            c.total_amount = fixedTotal;
          }
        }

        if (c.engagement_model === "daily" && currentTotal <= 0) {
          const rate = Number(paymentTerms.daily_rate || 0);
          const days = Number(paymentTerms.total_days || 0);
          if (rate > 0 && days > 0) {
            c.total_amount = rate * days;
          }
        }

        if (c.engagement_model === "sprint" && currentTotal <= 0) {
          const sprintRate = Number(paymentTerms.sprint_rate || 0);
          const totalSprints = Number(paymentTerms.total_sprints || 0);
          if (sprintRate > 0 && totalSprints > 0) {
            c.total_amount = sprintRate * totalSprints;
          }
        }
      } catch (e) {
        // ignore parsing issues
      }
      return c;
    });

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
    case "hourly":
      return (
        typeof paymentTerms.hourly_rate === "number" &&
        paymentTerms.hourly_rate > 0
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

    // Hourly: do not allow completion until escrow is fully released
    if (contract.engagement_model === "hourly") {
      const escrowBalance = parseFloat(contract.escrow_balance || 0);
      const releasedTotal = parseFloat(contract.released_total || 0);
      const totalAmount = parseFloat(contract.total_amount || 0);

      const escrowFullyReleased =
        totalAmount > 0
          ? releasedTotal >= totalAmount && escrowBalance <= 0
          : escrowBalance <= 0;

      if (!escrowFullyReleased) {
        return res.status(400).json({
          success: false,
          message: "Cannot complete contract until escrow is fully released",
          code: "ESCROW_NOT_FULLY_RELEASED",
        });
      }
    }

    // Daily: do not allow completion unless escrow was funded for the full contract value
    if (contract.engagement_model === "daily") {
      const fundedTotal = parseFloat(contract.escrow_funded_total || 0);
      const totalAmount = parseFloat(contract.total_amount || 0);

      const escrowFullyFunded = totalAmount > 0 ? fundedTotal >= totalAmount : true;

      if (!escrowFullyFunded) {
        return res.status(400).json({
          success: false,
          message: "Cannot complete contract until escrow is fully funded",
          code: "ESCROW_NOT_FULLY_FUNDED",
        });
      }
    }

    if (contract.engagement_model === "fixed") {
      const escrowBalance = parseFloat(contract.escrow_balance || 0);
      if (escrowBalance <= 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot complete a fixed contract with zero escrow balance",
          code: "ESCROW_EMPTY",
        });
      }

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

      if (!finalInvoice) {
        return res.status(400).json({
          success: false,
          message: "No final invoice amount to generate for this contract",
          code: "NO_FINAL_INVOICE",
        });
      }

      // Automatically pay the invoice + release funds from escrow.
      // If these fail, do not mark the contract completed.
      await Invoice.payInvoice(finalInvoice.id);
      await Contract.releaseEscrow(id, finalInvoice.amount);
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

    const parsedRating = Number(rating);
    const trimmedComment = typeof comment === "string" ? comment.trim() : "";

    if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a number between 1 and 5",
      });
    }

    if (!trimmedComment) {
      return res.status(400).json({
        success: false,
        message: "Review comment is required",
      });
    }

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
      parsedRating,
      trimmedComment,
      parsedRating >= 4,
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
  getContractFeedback,
  signContract,
  signNda,
  activateContract
};