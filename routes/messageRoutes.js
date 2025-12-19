import express from 'express';
import messageController from '../controllers/messageController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();


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
router.get('/', auth, messageController.getConversations);

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
router.get('/:id/messages', auth, messageController.getMessages);

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
router.post('/:id/messages', auth, messageController.sendMessage);

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
router.patch('/:id/read', auth, messageController.markAsRead);

export default router;