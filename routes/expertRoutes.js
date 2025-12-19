const express = require('express');
const router = express.Router();
const expertController = require('../controllers/expertController');

/**
 * @swagger
 * /api/experts:
 *   get:
 *     summary: Search for experts
 *     tags:
 *       - Experts
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *         description: Filter experts by domain
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search text for bio or name
 *     responses:
 *       200:
 *         description: List of experts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 */
router.get('/', expertController.searchExperts);

module.exports = router;