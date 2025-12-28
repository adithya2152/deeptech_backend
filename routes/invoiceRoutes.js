import express from "express";
import { auth } from "../middleware/auth.js";
import * as invoiceController from "../controllers/invoiceController.js";

const router = express.Router();

// Pay an invoice (Buyer or Admin)
router.patch("/:invoiceId/pay", auth, invoiceController.payInvoice);

// Get invoice by ID
router.get("/:invoiceId", auth, invoiceController.getInvoiceById);

export default router;
