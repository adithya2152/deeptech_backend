import express from 'express';
import expertController from '../controllers/expertController.js';

const router = express.Router();

/**
 * @swagger
 * /api/experts:
 *   get:
 *     summary: Get filtered list of experts
 *     tags:
 *       - Experts
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *         description: Comma-separated domains (e.g. ai,robotics)
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search by name or bio
 *       - in: query
 *         name: rateMin
 *         schema:
 *           type: integer
 *         description: Minimum hourly rate
 *       - in: query
 *         name: rateMax
 *         schema:
 *           type: integer
 *         description: Maximum hourly rate
 *       - in: query
 *         name: onlyVerified
 *         schema:
 *           type: boolean
 *         description: Set to true to see only vetted experts
 *     responses:
 *       200:
 *         description: List of experts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 experts:
 *                   type: array
 */
router.get('/', expertController.searchExperts);

/**
 * @swagger
 * /api/experts/{id}:
 *   get:
 *     summary: Get single expert profile
 *     tags:
 *       - Experts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The expert UUID
 *     responses:
 *       200:
 *         description: Expert profile details
 *       404:
 *         description: Expert not found
 */
router.get('/:id', expertController.getExpertById);

export default router;