import express from 'express';
import contractController from '../controllers/contractController.js';
import workLogController from '../controllers/workLogController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Contracts
 *     description: Contract lifecycle management
 *   - name: Work Logs
 *     description: Hour logging and reviews
 */

/* ============================
   CONTRACT LIFECYCLE
   ============================ */

/**
 * @swagger
 * /api/contracts:
 *   post:
 *     summary: Create a new contract
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - project_id
 *               - expert_id
 *               - hourly_rate
 *               - engagement_type
 *     responses:
 *       201:
 *         description: Contract created
 */
router.post('/', auth, contractController.createContract);

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: Get all contracts for current user
 *     tags: [Contracts]
 *     responses:
 *       200:
 *         description: List of contracts
 */
router.get('/', auth, contractController.getMyContracts);

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get contract details
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract details
 */
router.get('/:id', auth, contractController.getContractDetails);

/* ============================
   CONTRACT ACTIONS
   ============================ */

/**
 * @swagger
 * /api/contracts/{id}/accept:
 *   patch:
 *     summary: Accept a contract (Expert)
 *     tags: [Contracts]
 */
router.patch('/:id/accept', auth, contractController.acceptContract);

/**
 * @swagger
 * /api/contracts/{id}/decline:
 *   patch:
 *     summary: Decline a contract (Expert)
 *     tags: [Contracts]
 */
router.patch('/:id/decline', auth, contractController.declineContract);

/**
 * @swagger
 * /api/contracts/{id}/terminate:
 *   patch:
 *     summary: Terminate a contract
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract terminated
 */
router.patch('/:id/terminate', auth, contractController.terminateContract);

/* ============================
   WORK LOGS
   ============================ */

/**
 * @swagger
 * /api/contracts/{id}/hour-logs:
 *   get:
 *     summary: Get all hour logs for a contract
 *     tags: [Work Logs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of hour logs
 */
router.get('/:id/hour-logs', auth, workLogController.getHourLogs);

/**
 * @swagger
 * /api/contracts/{id}/hours:
 *   post:
 *     summary: Expert logs hours
 *     tags: [Work Logs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - log_date
 *               - hours_worked
 *               - description
 *               - value_tags
 */
router.post('/:id/hours', auth, workLogController.logHours);

/**
 * @swagger
 * /api/contracts/{id}/hours/{logId}/approve:
 *   patch:
 *     summary: Approve an hour log (Buyer)
 *     tags: [Work Logs]
 */
router.patch('/:id/hours/:logId/approve', auth, workLogController.approveHourLog);

/**
 * @swagger
 * /api/contracts/{id}/hours/{logId}/reject:
 *   patch:
 *     summary: Reject an hour log (Buyer)
 *     tags: [Work Logs]
 */
router.patch('/:id/hours/:logId/reject', auth, workLogController.rejectHourLog);

/* ============================
   INVOICES
   ============================ */

/**
 * @swagger
 * /api/contracts/{id}/invoices:
 *   get:
 *     summary: Get invoices for a contract
 *     tags: [Contracts]
 */
router.get('/:id/invoices', auth, contractController.getInvoices);

export default router;
