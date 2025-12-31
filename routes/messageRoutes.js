import express from "express";
import messageController from "../controllers/messageController.js";
import { auth } from "../middleware/auth.js";
import multer from "multer";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  storage: multer.memoryStorage(),
});

/**
 * @swagger
 * tags:
 *   - name: Messages
 *     description: Chat and messaging
 */

/**
 * @swagger
 * /api/chats:
 *   get:
 *     summary: Get all chats for current user
 *     tags: [Messages]
 *     responses:
 *       200:
 *         description: List of chats
 */
router.get("/", auth, messageController.getUserChats);

/**
 * @swagger
 * /api/chats/start:
 *   post:
 *     summary: Start or get a direct chat with a user
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *             properties:
 *               participantId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat object
 */
router.post("/start", auth, messageController.startDirectChat);

/**
 * @swagger
 * /api/chats/{chatId}:
 *   get:
 *     summary: Get chat details
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat details with members
 */
router.get("/:chatId", auth, messageController.getChatDetails);

/**
 * @swagger
 * /api/chats/{chatId}/messages:
 *   get:
 *     summary: Get all messages in a chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages with attachments
 */
router.get("/:chatId/messages", auth, messageController.getMessages);

/**
 * @swagger
 * /api/chats/{chatId}/messages:
 *   post:
 *     summary: Send a message to chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message created
 */
router.post("/:chatId/messages", auth, messageController.sendMessage);

/**
 * @swagger
 * /api/chats/{chatId}/members:
 *   post:
 *     summary: Add user to chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added
 */
router.post("/:chatId/members", auth, messageController.addChatMember);

/**
 * @swagger
 * /api/chats/{chatId}/members:
 *   delete:
 *     summary: Remove user from chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete("/:chatId/members", auth, messageController.removeChatMember);

/**
 * @swagger
 * /api/chats/{chatId}:
 *   delete:
 *     summary: Delete a chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat deleted successfully
 */
router.delete("/:chatId", auth, messageController.deleteChat);

/**
 * @swagger
 * /api/chats/{chatId}/attachments:
 *   post:
 *     summary: Upload file attachment to chat
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               encryptionKey:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded successfully
 */
router.post(
  "/:chatId/attachments",
  auth,
  upload.single("file"),
  messageController.uploadFileAttachment
);

/**
 * @swagger
 * /api/attachments/{attachmentId}:
 *   get:
 *     summary: Download file attachment
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File downloaded successfully
 */
router.get(
  "/attachments/:attachmentId",
  auth,
  messageController.downloadAttachment
);

/**
 * @swagger
 * /api/attachments/{attachmentId}:
 *   delete:
 *     summary: Delete file attachment
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attachment deleted successfully
 */
router.delete(
  "/attachments/:attachmentId",
  auth,
  messageController.deleteAttachment
);

export default router;