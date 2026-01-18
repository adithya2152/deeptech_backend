import { body, validationResult } from "express-validator";
import ContractDocument from "../models/contractDocumentModel.js";
import Contract from "../models/contractModel.js";
import pool from "../config/db.js";
import {
    generateServiceAgreement,
    generateNda,
    fillSignatures,
} from "../services/contractTemplateService.js";

/**
 * Validation for signing documents
 */
export const validateDocumentSigning = [
    body("signature_name")
        .notEmpty()
        .trim()
        .withMessage("Signature name is required"),
];

/**
 * Get all documents for a contract
 */
export const getContractDocuments = async (req, res) => {
    try {
        const { contractId } = req.params;
        const profileId = req.user.profileId;
        const userRole = req.user.role;

        // Verify access to contract
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
                message: "You do not have access to this contract",
            });
        }

        const documents = await ContractDocument.getByContractId(contractId);

        res.status(200).json({
            success: true,
            data: documents,
        });
    } catch (error) {
        console.error("Get contract documents error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch documents",
            error: error.message,
        });
    }
};

/**
 * Get a specific document
 */
export const getDocument = async (req, res) => {
    try {
        const { contractId, documentId } = req.params;
        const profileId = req.user.profileId;
        const userRole = req.user.role;

        // Verify access to contract
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
                message: "You do not have access to this contract",
            });
        }

        const document = await ContractDocument.getById(documentId);
        if (!document || document.contract_id !== contractId) {
            return res.status(404).json({
                success: false,
                message: "Document not found",
            });
        }

        res.status(200).json({
            success: true,
            data: document,
        });
    } catch (error) {
        console.error("Get document error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch document",
            error: error.message,
        });
    }
};

/**
 * Generate service agreement for a contract (auto-called on contract creation)
 */
export const generateContractServiceAgreement = async (contractId) => {
    try {
        // Get contract with full details
        const contractResult = await pool.query(
            `SELECT c.*, 
              p.title as project_title, 
              p.description as project_description,
              p.expected_outcome,
              p.domain,
              buyer_ua.first_name as buyer_first_name,
              buyer_ua.last_name as buyer_last_name,
              expert_ua.first_name as expert_first_name,
              expert_ua.last_name as expert_last_name
       FROM contracts c
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN profiles buyer_p ON c.buyer_profile_id = buyer_p.id
       LEFT JOIN user_accounts buyer_ua ON buyer_p.user_id = buyer_ua.id
       LEFT JOIN profiles expert_p ON c.expert_profile_id = expert_p.id
       LEFT JOIN user_accounts expert_ua ON expert_p.user_id = expert_ua.id
       WHERE c.id = $1`,
            [contractId]
        );

        if (contractResult.rows.length === 0) {
            throw new Error("Contract not found");
        }

        const contract = contractResult.rows[0];
        const paymentTerms =
            typeof contract.payment_terms === "string"
                ? JSON.parse(contract.payment_terms)
                : contract.payment_terms || {};

        // Generate service agreement content
        const content = generateServiceAgreement({
            buyerName: `${contract.buyer_first_name || ""} ${contract.buyer_last_name || ""}`.trim(),
            expertName: `${contract.expert_first_name || ""} ${contract.expert_last_name || ""}`.trim(),
            projectTitle: contract.project_title,
            projectDescription: contract.project_description,
            expectedOutcome: contract.expected_outcome,
            domain: contract.domain,
            engagementModel: contract.engagement_model,
            paymentTerms,
            startDate: contract.start_date,
            totalAmount: contract.total_amount,
        });

        // Create document record
        const document = await ContractDocument.create({
            contractId,
            documentType: "service_agreement",
            title: "Service Agreement",
            content,
        });

        return document;
    } catch (error) {
        console.error("Generate service agreement error:", error);
        throw error;
    }
};

/**
 * Generate NDA for a contract (called when buyer requests NDA)
 */
export const createNda = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { custom_content } = req.body;
        const buyerProfileId = req.user.profileId;

        // Verify buyer owns the contract
        const contract = await Contract.getById(contractId);
        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Contract not found",
            });
        }

        if (contract.buyer_profile_id !== buyerProfileId) {
            return res.status(403).json({
                success: false,
                message: "Only the buyer can create an NDA",
            });
        }

        // Check if NDA already exists
        const existingNda = await ContractDocument.getByContractAndType(
            contractId,
            "nda"
        );
        if (existingNda) {
            return res.status(400).json({
                success: false,
                message: "NDA already exists for this contract",
            });
        }

        // Get contract details for NDA generation
        const contractResult = await pool.query(
            `SELECT c.*, 
              p.title as project_title,
              buyer_ua.first_name as buyer_first_name,
              buyer_ua.last_name as buyer_last_name,
              expert_ua.first_name as expert_first_name,
              expert_ua.last_name as expert_last_name
       FROM contracts c
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN profiles buyer_p ON c.buyer_profile_id = buyer_p.id
       LEFT JOIN user_accounts buyer_ua ON buyer_p.user_id = buyer_ua.id
       LEFT JOIN profiles expert_p ON c.expert_profile_id = expert_p.id
       LEFT JOIN user_accounts expert_ua ON expert_p.user_id = expert_ua.id
       WHERE c.id = $1`,
            [contractId]
        );

        const contractDetails = contractResult.rows[0];

        // Generate NDA content
        const content = generateNda({
            buyerName: `${contractDetails.buyer_first_name || ""} ${contractDetails.buyer_last_name || ""}`.trim(),
            expertName: `${contractDetails.expert_first_name || ""} ${contractDetails.expert_last_name || ""}`.trim(),
            projectTitle: contractDetails.project_title,
            startDate: contractDetails.start_date,
            customContent: custom_content,
        });

        // Create NDA document
        const document = await ContractDocument.create({
            contractId,
            documentType: "nda",
            title: "Non-Disclosure Agreement",
            content,
        });

        // Update contract to mark NDA as required
        await pool.query(
            `UPDATE contracts SET nda_required = true WHERE id = $1`,
            [contractId]
        );

        res.status(201).json({
            success: true,
            message: "NDA created successfully",
            data: document,
        });
    } catch (error) {
        console.error("Create NDA error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create NDA",
            error: error.message,
        });
    }
};

/**
 * Sign a contract document
 */
export const signDocument = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { contractId, documentId } = req.params;
        const { signature_name } = req.body;
        const profileId = req.user.profileId;
        const ipAddress =
            req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

        // Get contract and document
        const contract = await Contract.getById(contractId);
        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Contract not found",
            });
        }

        const document = await ContractDocument.getById(documentId);
        if (!document || document.contract_id !== contractId) {
            return res.status(404).json({
                success: false,
                message: "Document not found",
            });
        }

        // Determine if user is buyer or expert
        const isBuyer = contract.buyer_profile_id === profileId;
        const isExpert = contract.expert_profile_id === profileId;

        if (!isBuyer && !isExpert) {
            return res.status(403).json({
                success: false,
                message: "You are not a party to this contract",
            });
        }

        // Check if already signed by this party
        if (isBuyer && document.buyer_signed_at) {
            return res.status(400).json({
                success: false,
                message: "You have already signed this document",
            });
        }
        if (isExpert && document.expert_signed_at) {
            return res.status(400).json({
                success: false,
                message: "You have already signed this document",
            });
        }

        // Sign the document
        let signedDocument;
        if (isBuyer) {
            signedDocument = await ContractDocument.signAsBuyer(
                documentId,
                signature_name,
                ipAddress
            );
        } else {
            signedDocument = await ContractDocument.signAsExpert(
                documentId,
                signature_name,
                ipAddress
            );
        }

        // Check if service agreement is now fully signed - activate contract
        if (document.document_type === "service_agreement") {
            const isFullySigned = await ContractDocument.isFullySigned(documentId);
            if (isFullySigned && contract.status === "pending") {
                // Activate the contract
                await pool.query(
                    `UPDATE contracts SET status = 'active', updated_at = NOW() WHERE id = $1`,
                    [contractId]
                );
                // Update project status
                await pool.query(
                    `UPDATE projects SET status = 'active' WHERE id = $1`,
                    [contract.project_id]
                );
            }
        }

        res.status(200).json({
            success: true,
            message: "Document signed successfully",
            data: signedDocument,
        });
    } catch (error) {
        console.error("Sign document error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to sign document",
            error: error.message,
        });
    }
};

/**
 * Update NDA custom content (buyer only, before signing)
 */
export const updateNdaContent = async (req, res) => {
    try {
        const { contractId, documentId } = req.params;
        const { custom_content } = req.body;
        const buyerProfileId = req.user.profileId;

        // Verify buyer owns the contract
        const contract = await Contract.getById(contractId);
        if (!contract || contract.buyer_profile_id !== buyerProfileId) {
            return res.status(403).json({
                success: false,
                message: "Only the buyer can update NDA content",
            });
        }

        const document = await ContractDocument.getById(documentId);
        if (!document || document.document_type !== "nda") {
            return res.status(404).json({
                success: false,
                message: "NDA not found",
            });
        }

        if (document.status === "signed") {
            return res.status(400).json({
                success: false,
                message: "Cannot update a signed NDA",
            });
        }

        // Regenerate NDA with new custom content
        const contractResult = await pool.query(
            `SELECT c.*, 
              p.title as project_title,
              buyer_ua.first_name as buyer_first_name,
              buyer_ua.last_name as buyer_last_name,
              expert_ua.first_name as expert_first_name,
              expert_ua.last_name as expert_last_name
       FROM contracts c
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN profiles buyer_p ON c.buyer_profile_id = buyer_p.id
       LEFT JOIN user_accounts buyer_ua ON buyer_p.user_id = buyer_ua.id
       LEFT JOIN profiles expert_p ON c.expert_profile_id = expert_p.id
       LEFT JOIN user_accounts expert_ua ON expert_p.user_id = expert_ua.id
       WHERE c.id = $1`,
            [contractId]
        );

        const contractDetails = contractResult.rows[0];
        const newContent = generateNda({
            buyerName: `${contractDetails.buyer_first_name || ""} ${contractDetails.buyer_last_name || ""}`.trim(),
            expertName: `${contractDetails.expert_first_name || ""} ${contractDetails.expert_last_name || ""}`.trim(),
            projectTitle: contractDetails.project_title,
            startDate: contractDetails.start_date,
            customContent: custom_content,
        });

        const updated = await ContractDocument.updateContent(documentId, newContent);

        res.status(200).json({
            success: true,
            message: "NDA updated successfully",
            data: updated,
        });
    } catch (error) {
        console.error("Update NDA error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update NDA",
            error: error.message,
        });
    }
};

export default {
    validateDocumentSigning,
    getContractDocuments,
    getDocument,
    generateContractServiceAgreement,
    createNda,
    signDocument,
    updateNdaContent,
};
