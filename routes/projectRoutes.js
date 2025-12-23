import express from 'express';
import projectController from '../controllers/projectController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects for current user
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, completed, archived]
 *         description: Filter projects by status
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/', auth, projectController.getMyProjects);

/**
 * @swagger
 * /api/projects/marketplace:
 *   get:
 *     summary: Get all active projects for experts
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: List of active projects
 */
router.get('/marketplace', auth, projectController.getMarketplaceProjects);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get single project details
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 */
router.get('/:id', auth, projectController.getProjectById);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               domain:
 *                 type: string
 *               trlLevel:
 *                 type: string
 *               expectedOutcome:
 *                 type: string
 *               riskCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *               budgetMin:
 *                 type: number
 *               budgetMax:
 *                 type: number
 *               deadline:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Project created successfully
 */
router.post('/', auth, projectController.createProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project updated
 */
router.put('/:id', auth, projectController.updateProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     summary: Update a project (partial update)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project updated
 */
router.patch('/:id', auth, projectController.updateProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 */
router.delete('/:id', auth, projectController.deleteProject);

/* ---------- PROPOSALS ---------- */

/**
 * @swagger
 * /api/projects/{id}/proposals:
 *   get:
 *     summary: Get all proposals for a project (Owner only)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of proposals
 */
router.get('/:id/proposals', auth, projectController.getProjectProposals);

/**
 * @swagger
 * /api/projects/{id}/proposals:
 *   post:
 *     summary: Submit a proposal (Expert only)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               duration:
 *                 type: number
 *               cover_letter:
 *                 type: string
 *     responses:
 *       201:
 *         description: Proposal submitted
 */
router.post('/:id/proposals', auth, projectController.submitProposal);

export default router;
