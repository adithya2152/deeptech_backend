import messageModel from "../models/messageModel.js";
import { uploadFile, deleteFile, BUCKETS } from "../utils/storage.js";
import {
  encryptFile,
  decryptFile,
  generateEncryptionKey,
} from "../utils/encryption.js";
import { supabase as supabaseClient } from "../config/supabase.js";

/**
 * Start or get a direct chat with another user
 */
const startDirectChat = async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user.id;

    if (userId === participantId) {
      return res.status(400).json({ error: "Cannot start chat with yourself" });
    }

    const chat = await messageModel.findOrCreateDirectChat(
      userId,
      participantId
    );

    res.status(200).json(chat);
  } catch (error) {
    console.error("START CHAT ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get all chats for the current user
 */
const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await messageModel.getUserChats(userId);
    res.status(200).json(chats);
  } catch (error) {
    console.error("GET CHATS ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get messages from a chat
 */
const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await messageModel.getMessages(chatId);
    res.status(200).json(messages);
  } catch (error) {
    console.error("GET MESSAGES ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Send a message to a chat
 */
const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;
    const senderId = req.user.id;

    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const message = await messageModel.createMessage(chatId, senderId, content);
    res.status(201).json(message);
  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get chat details
 */
const getChatDetails = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    const chat = await messageModel.getChatDetails(chatId, userId);
    res.status(200).json(chat);
  } catch (error) {
    console.error("GET CHAT DETAILS ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Add a user to chat
 */
const addChatMember = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    const result = await messageModel.addChatMember(chatId, userId);
    res.status(200).json({ result });
  } catch (error) {
    console.error("ADD CHAT MEMBER ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Remove a user from chat
 */
const removeChatMember = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    const result = await messageModel.removeChatMember(chatId, userId);
    res.status(200).json({ result });
  } catch (error) {
    console.error("REMOVE CHAT MEMBER ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Delete a chat
 */
const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    const result = await messageModel.deleteChat(chatId, userId);

    if (!result) {
      return res.status(404).json({ error: "Chat not found or access denied" });
    }
    res.status(200).json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("DELETE CHAT ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ============ ATTACHMENT METHODS ============

/**
 * Upload file attachment to message
 * Expects multipart/form-data with:
 * - file: file buffer
 * - encryptionKey: base64 encoded key (optional)
 */
const uploadFileAttachment = async (req, res) => {
  try {
    const { chatId } = req.params;
    const senderId = req.user.id;
    const file = req.file;

    if (!chatId || !file) {
      return res.status(400).json({
        error: "Chat ID and file are required",
      });
    }

    // Generate encryption key if not provided
    const encryptionKey = req.body.encryptionKey || generateEncryptionKey();

    // Encrypt the file
    const encryptedFileBuffer = encryptFile(file.buffer, encryptionKey);

    // Upload encrypted file to Supabase
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const filePath = `${chatId}/${timestamp}-${randomString}-${file.originalname}`;

    const uploadResult = await uploadFile(
      BUCKETS.CHAT_FILES,
      filePath,
      encryptedFileBuffer,
      "application/octet-stream"
    );

    // Create message with attachment info in content
    const message = await messageModel.createMessage(
      chatId,
      senderId,
      `[File: ${file.originalname}]`
    );

    // Save attachment record
    const attachment = await messageModel.createAttachment(
      message.id,
      file.originalname,
      uploadResult.path,
      file.size,
      file.mimetype,
      encryptionKey // Store the encryption key
    );

    res.status(201).json({
      message,
      attachment,
      encryptionKey, // Send back key to client for storage
    });
  } catch (error) {
    console.error("UPLOAD ATTACHMENT ERROR:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
};

/**
 * Download attachment
 */
const downloadAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;

    // Get attachment record
    const attachment = await messageModel.getAttachmentById(attachmentId);

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // Download encrypted file from Supabase
    const { data: encryptedBuffer, error } = await supabaseClient.storage
      .from(BUCKETS.CHAT_FILES)
      .download(attachment.filePath);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    // Decrypt the file
    const decryptedBuffer = decryptFile(
      Buffer.from(await encryptedBuffer.arrayBuffer()),
      attachment.encryptedKey
    );

    // Send file to client
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`
    );
    res.setHeader("Content-Length", decryptedBuffer.length);

    res.send(decryptedBuffer);
  } catch (error) {
    console.error("DOWNLOAD ATTACHMENT ERROR:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
};

/**
 * Delete attachment
 */
const deleteAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;

    // Get attachment record
    const attachment = await messageModel.getAttachmentById(attachmentId);

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // Delete from Supabase storage
    await deleteFile(BUCKETS.CHAT_FILES, attachment.filePath);

    // Delete from database
    await messageModel.deleteAttachment(attachmentId);

    res.status(200).json({ message: "Attachment deleted successfully" });
  } catch (error) {
    console.error("DELETE ATTACHMENT ERROR:", error);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
};

export default {
  startDirectChat,
  getUserChats,
  getMessages,
  sendMessage,
  getChatDetails,
  addChatMember,
  removeChatMember,
  deleteChat,
  uploadFileAttachment,
  downloadAttachment,
  deleteAttachment,
};