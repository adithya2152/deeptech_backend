const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// --- MOCK AUTH (Simulates "John Client") ---
const mockClientAuth = (req, res, next) => {
  req.user = { id: '64fa75fb-517a-46b0-8b67-12ccfad6d4aa' };
  next();
};

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects for current user
 *     tags:
 *       - Projects
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/', mockClientAuth, projectController.getMyProjects);

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
router.get('/:id', mockClientAuth, projectController.getProjectById);

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
router.post('/', mockClientAuth ,projectController.createProject);

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
router.put('/:id', mockClientAuth, projectController.updateProject);

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
router.delete('/:id', mockClientAuth,projectController.deleteProject);

module.exports = router;
