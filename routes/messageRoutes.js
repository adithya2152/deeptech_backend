const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// --- TEMPORARY MOCK AUTH MIDDLEWARE ---
const mockAuth = (req, res, next) => {
  req.user = { id: '03a071f4-c01c-4e33-bc09-b06cae53909b' };
  next();
};

/**
 * @swagger
 * tags:
 *   - name: Messages
 *     description: Chat and conversation management
 */

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: Get all conversations for current user
 *     tags:
 *       - Messages
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/', mockAuth, messageController.getConversations);

/**
 * @swagger
 * /api/conversations/{id}/messages:
 *   get:
 *     summary: Get all messages in a conversation
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/:id/messages', mockAuth, messageController.getMessages);

/**
 * @swagger
 * /api/conversations/{id}/messages:
 *   post:
 *     summary: Send a message
 *     tags:
 *       - Messages
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
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post('/:id/messages', mockAuth, messageController.sendMessage);

/**
 * @swagger
 * /api/conversations/{id}/read:
 *   patch:
 *     summary: Mark conversation as read
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation marked as read
 */
router.patch('/:id/read', mockAuth, messageController.markAsRead);

module.exports = router;
