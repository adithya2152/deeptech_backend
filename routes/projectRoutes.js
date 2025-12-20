import express from 'express';
import projectController from '../controllers/projectController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects for current user
 *     tags:
 *       - Projects
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
 * /api/projects/{id}:
 *   get:
 *     summary: Get single project details
 *     tags:
 *       - Projects
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
 *     tags:
 *       - Projects
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - clientId
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
 *               clientId:
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
 *       500:
 *         description: Server error
 */
router.post('/', auth ,projectController.createProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 example: closed
 *     responses:
 *       200:
 *         description: Project updated
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.put('/:id', auth, projectController.updateProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     summary: Update a project (partial update)
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 example: closed
 *     responses:
 *       200:
 *         description: Project updated
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.patch('/:id', auth, projectController.updateProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     responses:
 *       200:
 *         description: Project deleted
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', auth, projectController.deleteProject);

export default router;