import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import * as proposalsController from "../controllers/proposalsController.js";

const router = express.Router();

// Create a new proposal (Experts only)
router.post(
  "/",
  auth,
  requireRole("expert"),
  proposalsController.validateProposal,
  proposalsController.createProposal
);

// Get all proposals for a project
router.get(
  "/project/:projectId",
  auth,
  proposalsController.getProposalsByProject
);

// Get all proposals by current expert
router.get(
  "/expert/my-proposals",
  auth,
  requireRole("expert"),
  proposalsController.getMyProposals
);

// Get single proposal by ID
router.get("/:proposalId", auth, proposalsController.getProposalById);

// Update proposal (Expert only)
router.patch(
  "/:proposalId",
  auth,
  requireRole("expert"),
  proposalsController.updateProposal
);

// Withdraw/Delete proposal (Expert only)
router.delete(
  "/:proposalId",
  auth,
  requireRole("expert"),
  proposalsController.withdrawProposal
);

export default router;
