const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

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
router.post('/', projectController.createProject);

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
router.put('/:id', projectController.updateProject);

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
router.delete('/:id', projectController.deleteProject);

module.exports = router;
