import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import * as contractController from "../controllers/contractController.js";

const router = express.Router();

// Create a new contract (Buyers only)
router.post(
  "/",
  auth,
  requireRole("buyer"),
  contractController.validateContractCreation,
  contractController.createContract
);

// Accept contract and sign NDA (Experts only)
router.post(
  "/:contractId/accept-and-sign-nda",
  auth,
  requireRole("expert"),
  contractController.validateNdaSigning,
  contractController.acceptAndSignNda
);

router.patch(
  "/:contractId/nda",
  auth,
  requireRole("buyer"),
  contractController.updateNda
);

// Get all contracts for current user
router.get("/", auth, contractController.getMyContracts);

// Get all contracts for a project
router.get("/project/:projectId", auth, contractController.getProjectContracts);

// Get invoices for a contract
router.get(
  "/:contractId/invoices",
  auth,
  contractController.getContractInvoices
);

// Get contract by ID
router.get("/:contractId", auth, contractController.getContractById);

// Decline contract (Expert only)
router.post(
  "/:contractId/decline",
  auth,
  requireRole("expert"),
  contractController.declineContract
);

// Fund escrow (Buyer only)
router.post(
  "/:contractId/fund",
  auth,
  requireRole("buyer"),
  contractController.fundEscrow
);

// Finish sprint (Buyer only) - for sprint engagement model
router.post(
  "/:id/finish-sprint",
  auth,
  requireRole("buyer"),
  contractController.finishSprint
);

// Complete contract (Buyer only)
router.post(
  "/:id/complete",
  auth,
  requireRole("buyer"),
  contractController.completeContract
);

export default router;
