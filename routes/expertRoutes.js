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
 * /api/experts/semantic-search:
 *   post:
 *     summary: Semantic search for experts using AI
 *     tags:
 *       - Experts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Natural language search query
 *               limit:
 *                 type: integer
 *                 default: 10
 *                 description: Maximum number of results
 *     responses:
 *       200:
 *         description: AI-powered search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       bio:
 *                         type: string
 *                       similarity:
 *                         type: number
 *                 query:
 *                   type: string
 *                 total:
 *                   type: integer
 *       500:
 *         description: Search service unavailable
 */
router.post('/semantic-search', expertController.semanticSearch);

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