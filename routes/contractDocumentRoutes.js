import express from "express";
import { auth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import ContractDocumentController from "../controllers/contractDocumentController.js";

const router = express.Router();

// Get all documents for a contract
router.get(
    "/:contractId/documents",
    auth,
    ContractDocumentController.getContractDocuments
);

// Get a specific document
router.get(
    "/:contractId/documents/:documentId",
    auth,
    ContractDocumentController.getDocument
);

// Create NDA for a contract (buyer only)
router.post(
    "/:contractId/documents/nda",
    requireRole("buyer"),
    ContractDocumentController.createNda
);

// Update NDA content (buyer only, before signing)
router.patch(
    "/:contractId/documents/:documentId/content",
    requireRole("buyer"),
    ContractDocumentController.updateNdaContent
);

// Sign a document
router.post(
    "/:contractId/documents/:documentId/sign",
    auth,
    ContractDocumentController.validateDocumentSigning,
    ContractDocumentController.signDocument
);

export default router;
