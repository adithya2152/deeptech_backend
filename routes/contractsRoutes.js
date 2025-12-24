import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import * as contractsController from "../controllers/contractsController.js";

const router = express.Router();

// Create a new contract (Buyers only)
router.post(
  "/",
  auth,
  requireRole("buyer"),
  contractsController.validateContractCreation,
  contractsController.createContract
);

// Accept contract and sign NDA (Experts only)
router.post(
  "/:contractId/accept-and-sign-nda",
  auth,
  requireRole("expert"),
  contractsController.validateNdaSigning,
  contractsController.acceptAndSignNda
);

// Get all contracts for current user
router.get("/", auth, contractsController.getMyContracts);

// Get all contracts for a project
router.get(
  "/project/:projectId",
  auth,
  contractsController.getProjectContracts
);

// Get contract by ID
router.get("/:contractId", auth, contractsController.getContractById);

// Decline contract (Expert only)
router.post(
  "/:contractId/decline",
  auth,
  requireRole("expert"),
  contractsController.declineContract
);

export default router;
