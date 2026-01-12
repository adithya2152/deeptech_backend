import Invoice from "../models/invoiceModel.js";
import Contract from "../models/contractModel.js";
import pool from "../config/db.js";

// Pay an invoice (Buyer or Admin)
export const payInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    // Get invoice
    const invoice = await Invoice.getById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Validate invoice status
    if (invoice.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Invoice is not in pending status",
      });
    }

    // Get contract to verify access
    const contract = await Contract.getById(invoice.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Associated contract not found",
      });
    }

    // Check authorization: buyer (by profile_id) or admin
    if (contract.buyer_profile_id !== profileId && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can pay invoices",
      });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update invoice to paid
      const paidInvoice = await Invoice.payInvoice(invoiceId);

      // Keep total_amount unchanged
      const newTotalAmount = contract.total_amount;

      const newEscrowBalance = Math.max(
        parseFloat(contract.escrow_balance || 0) - parseFloat(invoice.amount),
        0
      );
      const newReleasedTotal =
        parseFloat(contract.released_total || 0) + parseFloat(invoice.amount);

      const updateContractQuery = `
        UPDATE contracts
        SET 
          total_amount = $1,
          escrow_balance = $2,
          released_total = $3
        WHERE id = $4
        RETURNING *;
      `;

      const { rows } = await client.query(updateContractQuery, [
        newTotalAmount,
        newEscrowBalance,
        newReleasedTotal,
        invoice.contract_id,
      ]);

      const updatedContract = rows[0];

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Invoice paid successfully",
        data: {
          invoice: paidInvoice,
          contract: updatedContract,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Pay invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to pay invoice",
      error: error.message,
    });
  }
};

// Get invoice by ID (Buyer, Expert, or Admin on that contract)
export const getInvoiceById = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const profileId = req.user.profileId;
    const userRole = req.user.role;

    const invoice = await Invoice.getById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Get contract to verify access
    const contract = await Contract.getById(invoice.contract_id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Associated contract not found",
      });
    }

    // Check access using profile IDs
    if (
      contract.buyer_profile_id !== profileId &&
      contract.expert_profile_id !== profileId &&
      userRole !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this invoice",
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoice",
      error: error.message,
    });
  }
};

export default {
  payInvoice,
  getInvoiceById,
};
