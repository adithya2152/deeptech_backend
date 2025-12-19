const pool = require('../config/db');

// Get all conversations for a specific user (Profile ID)
exports.getConversations = async (profileId) => {
  const sql = `
    SELECT 
      c.id,
      c.last_message_at as "lastMessageAt",
      -- Get the OTHER user's details
      p.id as "otherUserId",
      p.first_name || ' ' || p.last_name as "otherUserName",
      p.role as "otherUserRole",
      -- Get the last message content
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as "lastMessage",
      -- Count unread messages sent BY the other person
      (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.is_read = false) as "unreadCount"
    FROM conversations c
    -- Join profiles to find the participant who is NOT the current user
    JOIN profiles p ON (CASE WHEN c.participant_1 = $1 THEN c.participant_2 ELSE c.participant_1 END) = p.id
    WHERE c.participant_1 = $1 OR c.participant_2 = $1
    ORDER BY c.last_message_at DESC;
  `;
  
  const { rows } = await pool.query(sql, [profileId]);
  
  return rows.map(row => ({
    id: row.id,
    otherUser: {
      id: row.otherUserId,
      name: row.otherUserName,
      role: row.otherUserRole
    },
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount
  }));
};

// Get messages for a specific conversation
exports.getMessages = async (conversationId) => {
  const sql = `
    SELECT 
      id,
      conversation_id as "conversationId",
      sender_id as "senderId",
      content,
      created_at as "createdAt"
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `;
  const { rows } = await pool.query(sql, [conversationId]);
  return rows;
};

// Send a new message
exports.createMessage = async (conversationId, senderId, content) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgQuery = `
      INSERT INTO messages (conversation_id, sender_id, content, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, conversation_id as "conversationId", sender_id as "senderId", content, created_at as "createdAt"
    `;
    const { rows: msgRows } = await client.query(msgQuery, [conversationId, senderId, content]);

    await client.query(`UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, [conversationId]);

    await client.query('COMMIT');
    return msgRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Mark conversation as read
exports.markAsRead = async (conversationId, userId) => {
  const sql = `
    UPDATE messages
    SET is_read = true
    WHERE conversation_id = $1 AND sender_id != $2
  `;
  await pool.query(sql, [conversationId, userId]);
};