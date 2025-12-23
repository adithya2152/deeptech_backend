import pool from '../config/db.js';

export const findExistingConversation = async (participant1, participant2) => {
  const sql = `
    SELECT id 
    FROM conversations 
    WHERE (participant_1 = $1 AND participant_2 = $2)
       OR (participant_1 = $2 AND participant_2 = $1)
    LIMIT 1;
  `;
  const { rows } = await pool.query(sql, [participant1, participant2]);
  return rows[0];
};

export const createConversation = async (participant1, participant2) => {
  const sql = `
    INSERT INTO conversations (participant_1, participant_2, created_at, updated_at, last_message_at)
    VALUES ($1, $2, NOW(), NOW(), NOW())
    RETURNING id, participant_1, participant_2, created_at;
  `;
  const { rows } = await pool.query(sql, [participant1, participant2]);
  return rows[0];
};

export const getConversations = async (profileId) => {
  const sql = `
    SELECT 
      c.id,
      c.last_message_at as "lastMessageAt",
      p.id as "otherUserId",
      p.first_name || ' ' || p.last_name as "otherUserName",
      p.role as "otherUserRole",
      p.avatar_url as "otherUserAvatar",
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as "lastMessage",
      (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.is_read = false) as "unreadCount"
    FROM conversations c
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
      role: row.otherUserRole,
      avatar_url: row.otherUserAvatar 
    },
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount
  }));
};

export const getMessages = async (conversationId) => {
  const sql = `
    SELECT 
      id,
      conversation_id as "conversationId",
      sender_id as "senderId",
      content,
      created_at as "createdAt",
      is_read as "isRead"
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `;
  const { rows } = await pool.query(sql, [conversationId]);
  return rows;
};

export const createMessage = async (conversationId, senderId, content) => {
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

export const markAsRead = async (conversationId, userId) => {
  const sql = `
    UPDATE messages
    SET is_read = true
    WHERE conversation_id = $1 AND sender_id != $2
  `;
  await pool.query(sql, [conversationId, userId]);
};

export const deleteConversation = async (conversationId, userId) => {
  const sql = `
    DELETE FROM conversations 
    WHERE id = $1 
    AND (participant_1 = $2 OR participant_2 = $2)
    RETURNING id;
  `;
  const { rows } = await pool.query(sql, [conversationId, userId]);
  return rows[0];
};

export default {
  getConversations,
  getMessages,
  createMessage,
  markAsRead,
  findExistingConversation,
  createConversation,
  deleteConversation
};