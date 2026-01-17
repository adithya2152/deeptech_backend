import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import * as contractController from "../controllers/contractController.js";

const router = express.Router();

router.post(
  "/",
  auth,
  requireRole("buyer"),
  contractController.validateContractCreation,
  contractController.createContract
);

router.post(
  "/:contractId/accept-and-sign-nda",
  auth,
  requireRole("expert"),
  contractController.validateNdaSigning,
  contractController.acceptAndSignNda
);

router.post(
  "/:contractId/sign-contract",
  auth,
  contractController.signContract
);

router.post(
  "/:contractId/sign-nda",
  auth,
  requireRole("expert"),
  contractController.validateNdaSigning,
  contractController.signNda
);

router.post(
  "/:contractId/activate",
  auth,
  // Accessible to both, logic handles permission/state check
  contractController.activateContract
);

router.patch(
  "/:contractId/nda",
  auth,
  requireRole("buyer"),
  contractController.updateNda
);

router.get("/", auth, contractController.getMyContracts);

router.get("/project/:projectId", auth, contractController.getProjectContracts);

router.get(
  "/:contractId/invoices",
  auth,
  contractController.getContractInvoices
);

router.get("/:contractId", auth, contractController.getContractById);

router.post(
  "/:contractId/decline",
  auth,
  // No role restriction - controller checks if user is buyer or expert
  contractController.declineContract
);

router.post(
  "/:contractId/fund",
  auth,
  requireRole("buyer"),
  contractController.fundEscrow
);

router.post(
  "/:id/finish-sprint",
  auth,
  requireRole("buyer"),
  contractController.finishSprint
);

router.post(
  "/:id/complete",
  auth,
  requireRole("buyer"),
  contractController.completeContract
);

router.post(
  "/:contractId/feedback",
  auth,
  contractController.submitFeedback
);

router.get(
  "/:contractId/feedback",
  auth,
  contractController.getContractFeedback
);

export default router;