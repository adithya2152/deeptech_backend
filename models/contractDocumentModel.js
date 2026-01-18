import pool from "../config/db.js";

/**
 * Contract Document Model for service agreements and NDAs
 */
const ContractDocument = {
    /**
     * Create a new contract document
     */
    async create({
        contractId,
        documentType,
        title,
        content,
        pdfUrl = null,
    }) {
        const result = await pool.query(
            `INSERT INTO contract_documents (
        contract_id, document_type, title, content, pdf_url
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
            [contractId, documentType, title, content, pdfUrl]
        );
        return result.rows[0];
    },

    /**
     * Get document by ID
     */
    async getById(id) {
        const result = await pool.query(
            `SELECT * FROM contract_documents WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get all documents for a contract
     */
    async getByContractId(contractId) {
        const result = await pool.query(
            `SELECT * FROM contract_documents 
       WHERE contract_id = $1
       ORDER BY document_type, created_at DESC`,
            [contractId]
        );
        return result.rows;
    },

    /**
     * Get specific document type for a contract
     */
    async getByContractAndType(contractId, documentType) {
        const result = await pool.query(
            `SELECT * FROM contract_documents 
       WHERE contract_id = $1 AND document_type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
            [contractId, documentType]
        );
        return result.rows[0] || null;
    },

    /**
     * Update document content
     */
    async updateContent(id, content) {
        const result = await pool.query(
            `UPDATE contract_documents 
       SET content = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
            [id, content]
        );
        return result.rows[0] || null;
    },

    /**
     * Set PDF URL
     */
    async setPdfUrl(id, pdfUrl) {
        const result = await pool.query(
            `UPDATE contract_documents 
       SET pdf_url = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [id, pdfUrl]
        );
        return result.rows[0] || null;
    },

    /**
     * Sign document as buyer
     */
    async signAsBuyer(id, signatureName, ipAddress) {
        const result = await pool.query(
            `UPDATE contract_documents 
       SET buyer_signed_at = NOW(),
           buyer_signature_name = $2,
           buyer_ip_address = $3,
           status = CASE 
             WHEN expert_signed_at IS NOT NULL THEN 'signed' 
             ELSE status 
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [id, signatureName, ipAddress]
        );
        return result.rows[0] || null;
    },

    /**
     * Sign document as expert
     */
    async signAsExpert(id, signatureName, ipAddress) {
        const result = await pool.query(
            `UPDATE contract_documents 
       SET expert_signed_at = NOW(),
           expert_signature_name = $2,
           expert_ip_address = $3,
           status = CASE 
             WHEN buyer_signed_at IS NOT NULL THEN 'signed' 
             ELSE status 
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [id, signatureName, ipAddress]
        );
        return result.rows[0] || null;
    },

    /**
     * Check if document is fully signed
     */
    async isFullySigned(id) {
        const result = await pool.query(
            `SELECT buyer_signed_at, expert_signed_at 
       FROM contract_documents WHERE id = $1`,
            [id]
        );
        if (!result.rows[0]) return false;
        return result.rows[0].buyer_signed_at && result.rows[0].expert_signed_at;
    },

    /**
     * Check if service agreement is signed for a contract
     */
    async isServiceAgreementSigned(contractId) {
        const result = await pool.query(
            `SELECT id FROM contract_documents 
       WHERE contract_id = $1 
         AND document_type = 'service_agreement'
         AND status = 'signed'
       LIMIT 1`,
            [contractId]
        );
        return result.rows.length > 0;
    },

    /**
     * Delete document (only pending documents)
     */
    async delete(id) {
        const result = await pool.query(
            `DELETE FROM contract_documents 
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
            [id]
        );
        return result.rows[0] || null;
    },
};

export default ContractDocument;
