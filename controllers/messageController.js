const messageModel = require('../models/messageModel');

exports.getConversations = async (req, res) => {
  try {
    // Assuming req.user.id is the Profile ID from your auth middleware
    const userId = req.user.id; 
    const conversations = await messageModel.getConversations(userId);
    res.status(200).json({ conversations });
  } catch (error) {
    console.error("GET CONVERSATIONS ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await messageModel.getMessages(id);
    res.status(200).json({ messages });
  } catch (error) {
    console.error("GET MESSAGES ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { id } = req.params; // Conversation ID
    const { content } = req.body;
    const senderId = req.user.id; // Sender is current user

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const message = await messageModel.createMessage(id, senderId, content);
    res.status(201).json({ message });
  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await messageModel.markAsRead(id, userId);
    res.status(200).json({ message: 'Conversation marked as read' });
  } catch (error) {
    console.error("MARK READ ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};