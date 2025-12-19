import express from 'express';
import contractController from '../controllers/contractController.js';
import workLogController from '../controllers/workLogController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Contract Lifecycle
 *     description: Hiring, status management (Accept/Decline/Pause), and general details
 *   - name: Hour Logging
 *     description: Expert-facing endpoints for tracking work and value tags
 *   - name: Contract Review & Analytics
 *     description: Buyer-facing approvals and weekly progress tracking
 */

/* ============================
   1. CONTRACT LIFECYCLE
   ============================ */

/**
 * @swagger
 * /api/contracts:
 *   post:
 *     summary: Create a new contract (Buyer invites Expert)
 *     tags:
 *       - Contract Lifecycle
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               expertId:
 *                 type: string
 *                 format: uuid
 *               engagementType:
 *                 type: string
 *                 enum:
 *                   - hourly
 *                   - fixed
 *               hourlyRate:
 *                 type: number
 *               weeklyHourCap:
 *                 type: number
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               ipOwnership:
 *                 type: string
 *                 enum:
 *                   - client
 *                   - shared
 *                   - expert
 *               ndaSigned:
 *                 type: boolean
 *               escrowAmount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Contract created
 */
router.post('/', auth, contractController.createContract);

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: Get all contracts for the current user
 *     tags:
 *       - Contract Lifecycle
 *     responses:
 *       200:
 *         description: List of contracts
 */
router.get('/', auth, contractController.getMyContracts);

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get specific contract details
 *     tags:
 *       - Contract Lifecycle
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contract details
 */
router.get('/:id', auth, contractController.getContractDetails);

/**
 * @swagger
 * /api/contracts/{id}/accept:
 *   patch:
 *     summary: Expert accepts the contract
 *     tags:
 *       - Contract Lifecycle
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contract activated
 */
router.patch('/:id/accept', auth, contractController.acceptContract);

/**
 * @swagger
 * /api/contracts/{id}/decline:
 *   patch:
 *     summary: Expert declines the contract
 *     tags:
 *       - Contract Lifecycle
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract declined
 */
router.patch('/:id/decline', auth, contractController.declineContract);

/**
 * @swagger
 * /api/contracts/{id}/pause:
 *   patch:
 *     summary: Pause an active contract
 *     tags:
 *       - Contract Lifecycle
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract paused
 */
router.patch('/:id/pause', auth, contractController.pauseContract);

/**
 * @swagger
 * /api/contracts/{id}/resume:
 *   patch:
 *     summary: Resume a paused contract
 *     tags:
 *       - Contract Lifecycle
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contract resumed
 */
router.patch('/:id/resume', auth, contractController.resumeContract);

/* ============================
   2. HOUR LOGGING
   ============================ */

/**
 * @swagger
 * /api/contracts/{id}/hours:
 *   post:
 *     summary: Expert logs hours with value tags
 *     tags:
 *       - Hour Logging
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               hours:
 *                 type: number
 *               description:
 *                 type: string
 *               valueTags:
 *                 type: object
 *                 properties:
 *                   decisionMade:
 *                     type: string
 *                   riskAvoided:
 *                     type: string
 *                   pathClarified:
 *                     type: string
 *                   knowledgeTransferred:
 *                     type: string
 *                   problemSolved:
 *                     type: string
 *     responses:
 *       201:
 *         description: Hours logged
 */
router.post('/:id/hours', auth, workLogController.logHours);

/**
 * @swagger
 * /api/contracts/{id}/hours:
 *   get:
 *     summary: Get all hour logs for a contract
 *     tags:
 *       - Hour Logging
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of logs
 */
router.get('/:id/hours', auth, workLogController.getHourLogs);

/* ============================
   3. REVIEW & ANALYTICS
   ============================ */

/**
 * @swagger
 * /api/contracts/{id}/hours/{logId}/approve:
 *   patch:
 *     summary: Buyer approves an hour log
 *     tags:
 *       - Contract Review & Analytics
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hours approved
 */
router.patch('/:id/hours/:logId/approve', auth, workLogController.approveHourLog);

/**
 * @swagger
 * /api/contracts/{id}/hours/{logId}/reject:
 *   patch:
 *     summary: Buyer rejects an hour log
 *     tags:
 *       - Contract Review & Analytics
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hours rejected
 */
router.patch('/:id/hours/:logId/reject', auth, workLogController.rejectHourLog);

/**
 * @swagger
 * /api/contracts/{id}/hours/weekly:
 *   get:
 *     summary: Get weekly hour tracking summary
 *     tags:
 *       - Contract Review & Analytics
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: week
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Weekly summary
 */
router.get('/:id/hours/weekly', auth, workLogController.getWeeklySummary);

export default router;