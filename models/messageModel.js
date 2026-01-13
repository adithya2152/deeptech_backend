import pool from "../config/db.js";

/**
 * Find or create a direct chat between two users
 * @param {string} userId1 - The initiating user's ID
 * @param {string} userId2 - The participant's ID
 * @param {string} role1 - The role of the initiating user (buyer/expert)
 * @param {string} role2 - The role of the participant (buyer/expert)
 */
export const findOrCreateDirectChat = async (userId1, userId2, role1 = 'expert', role2 = 'expert') => {
  try {
    // First try to find ANY existing direct chat between these two users (ignoring roles)
    // This prevents duplicate chats when users interact as different roles
    const findSql = `
      SELECT c.id, c.type, c.created_at
      FROM chats c
      JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
      JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
      WHERE c.type = 'direct'
      LIMIT 1;
    `;

    const { rows: existingChat } = await pool.query(findSql, [
      userId1,
      userId2,
    ]);

    if (existingChat.length > 0) {
      // Update the member roles if they've changed (optional, keeps roles current)
      const updateRolesSql = `
        UPDATE chat_members 
        SET member_role = CASE 
          WHEN user_id = $1 THEN $3
          WHEN user_id = $2 THEN $4
          ELSE member_role
        END
        WHERE chat_id = $5 AND user_id IN ($1, $2);
      `;
      await pool.query(updateRolesSql, [userId1, userId2, role1, role2, existingChat[0].id]);

      return existingChat[0];
    }

    // Create new direct chat
    const createSql = `
      INSERT INTO chats (type, created_at)
      VALUES ('direct', NOW())
      RETURNING id, type, created_at;
    `;

    const { rows: newChat } = await pool.query(createSql);
    const chatId = newChat[0].id;

    // Add both users to chat_members with their roles
    const addMembersSql = `
      INSERT INTO chat_members (chat_id, user_id, member_role, joined_at)
      VALUES ($1, $2, $3, NOW()), ($1, $4, $5, NOW())
      ON CONFLICT DO NOTHING;
    `;

    await pool.query(addMembersSql, [chatId, userId1, role1, userId2, role2]);

    return newChat[0];
  } catch (error) {
    console.error("Error finding or creating direct chat:", error);
    throw error;
  }
};

/**
 * Get all chats for a user filtered by their current role
 * @param {string} userId - The user's ID
 * @param {string} role - The user's current role (buyer/expert)
 */
export const getUserChats = async (userId, role = null) => {
  try {
    // Build query with optional role filter
    const sql = `
      SELECT 
        c.id,
        c.type,
        c.created_at as "createdAt",
        (SELECT COUNT(*)::int FROM chat_members WHERE chat_id = c.id) as "memberCount",
        (SELECT content FROM messages WHERE chat_id = c.id 
         ORDER BY created_at DESC LIMIT 1) as "lastMessage",
        (SELECT created_at FROM messages WHERE chat_id = c.id 
         ORDER BY created_at DESC LIMIT 1) as "lastMessageAt",
        json_agg(
          json_build_object(
            'id', u.id,
            'name', u.first_name || ' ' || u.last_name,
            'role', u.role,
            'avatar_url', u.avatar_url
          ) ORDER BY cm.joined_at
        ) as "members"
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      JOIN user_accounts u ON cm.user_id = u.id
      WHERE c.id IN (
        SELECT chat_id FROM chat_members 
        WHERE user_id = $1
        ${role ? 'AND member_role = $2' : ''}
      )
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `;

    const params = role ? [userId, role] : [userId];
    const { rows } = await pool.query(sql, params);

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt,
      memberCount: row.memberCount,
      members: row.members,
      lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt,
    }));
  } catch (error) {
    console.error("Error getting user chats:", error);
    throw error;
  }
};
/**
 * Get messages in a chat
 */
export const getMessages = async (chatId) => {
  try {
    const sql = `
      SELECT 
        m.id,
        m.chat_id as "chatId",
        m.sender_id as "senderId",
        m.content,
        m.created_at as "createdAt",
        json_agg(
          json_build_object(
            'id', ma.id,
            'fileName', ma.file_name,
            'fileSize', ma.file_size,
            'mimeType', ma.mime_type,
            'encryptedKey', ma.encrypted_key,
            'createdAt', ma.created_at
          ) ORDER BY ma.created_at
        ) FILTER (WHERE ma.id IS NOT NULL) as "attachments"
      FROM messages m
      LEFT JOIN message_attachments ma ON m.id = ma.message_id
      WHERE m.chat_id = $1
      GROUP BY m.id, m.chat_id, m.sender_id, m.content, m.created_at
      ORDER BY m.created_at ASC;
    `;

    const { rows } = await pool.query(sql, [chatId]);
    return rows;
  } catch (error) {
    console.error("Error getting messages:", error);
    throw error;
  }
};

/**
 * Create a message
 */
export const createMessage = async (chatId, senderId, content) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify user is member of chat
    const memberCheckSql = `
      SELECT 1 FROM chat_members 
      WHERE chat_id = $1 AND user_id = $2;
    `;

    const { rows: memberCheck } = await client.query(memberCheckSql, [
      chatId,
      senderId,
    ]);

    if (memberCheck.length === 0) {
      throw new Error("User is not a member of this chat");
    }

    // Insert message
    const msgSql = `
      INSERT INTO messages (chat_id, sender_id, content, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING 
        id,
        chat_id as "chatId",
        sender_id as "senderId",
        content,
        created_at as "createdAt"
    `;

    const { rows: msgRows } = await client.query(msgSql, [
      chatId,
      senderId,
      content,
    ]);

    await client.query("COMMIT");
    return msgRows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating message:", error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get chat details with members
 */
export const getChatDetails = async (chatId, userId) => {
  try {
    const sql = `
      SELECT 
        c.id,
        c.type,
        c.created_at as "createdAt",
        json_agg(
          json_build_object(
            'id', u.id,
            'name', u.first_name || ' ' || u.last_name,
            'role', u.role,
            'avatar_url', u.avatar_url,
            'joinedAt', cm.joined_at
          ) ORDER BY cm.joined_at
        ) as "members"
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      JOIN user_accounts u ON cm.user_id = u.id
      WHERE c.id = $1
      AND c.id IN (
        SELECT chat_id FROM chat_members WHERE user_id = $2
      )
      GROUP BY c.id, c.type, c.created_at;
    `;

    const { rows } = await pool.query(sql, [chatId, userId]);

    if (rows.length === 0) {
      throw new Error("Chat not found or access denied");
    }

    return rows[0];
  } catch (error) {
    console.error("Error getting chat details:", error);
    throw error;
  }
};

/**
 * Add user to chat
 */
export const addChatMember = async (chatId, userId) => {
  try {
    const sql = `
      INSERT INTO chat_members (chat_id, user_id, joined_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (chat_id, user_id) DO NOTHING
      RETURNING chat_id, user_id, joined_at;
    `;

    const { rows } = await pool.query(sql, [chatId, userId]);
    return rows[0] || { message: "User already member of chat" };
  } catch (error) {
    console.error("Error adding chat member:", error);
    throw error;
  }
};

/**
 * Remove user from chat
 */
export const removeChatMember = async (chatId, userId) => {
  try {
    const sql = `
      DELETE FROM chat_members
      WHERE chat_id = $1 AND user_id = $2
      RETURNING chat_id, user_id;
    `;

    const { rows } = await pool.query(sql, [chatId, userId]);
    return rows[0];
  } catch (error) {
    console.error("Error removing chat member:", error);
    throw error;
  }
};

/**
 * Delete chat (only if user is member)
 */
export const deleteChat = async (chatId, userId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify user is member
    const memberCheckSql = `
      SELECT 1 FROM chat_members 
      WHERE chat_id = $1 AND user_id = $2;
    `;

    const { rows: memberCheck } = await client.query(memberCheckSql, [
      chatId,
      userId,
    ]);

    if (memberCheck.length === 0) {
      throw new Error("User is not a member of this chat");
    }

    // Delete messages and attachments
    const deleteAttachmentsSql = `
      DELETE FROM message_attachments
      WHERE message_id IN (
        SELECT id FROM messages WHERE chat_id = $1
      );
    `;
    await client.query(deleteAttachmentsSql, [chatId]);

    const deleteMessagesSql = `
      DELETE FROM messages WHERE chat_id = $1;
    `;
    await client.query(deleteMessagesSql, [chatId]);

    // Delete chat members
    const deleteMembersSql = `
      DELETE FROM chat_members WHERE chat_id = $1;
    `;
    await client.query(deleteMembersSql, [chatId]);

    // Delete chat
    const deleteChatSql = `
      DELETE FROM chats WHERE id = $1
      RETURNING id;
    `;
    const { rows } = await client.query(deleteChatSql, [chatId]);

    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting chat:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============ ATTACHMENT METHODS ============

/**
 * Create message attachment record
 */
export const createAttachment = async (
  messageId,
  fileName,
  filePath,
  fileSize,
  mimeType,
  encryptedKey
) => {
  try {
    const sql = `
      INSERT INTO message_attachments (
        message_id, 
        file_name, 
        file_path, 
        file_size, 
        mime_type, 
        encrypted_key,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING 
        id, 
        message_id as "messageId",
        file_name as "fileName",
        file_path as "filePath", 
        file_size as "fileSize",
        mime_type as "mimeType",
        created_at as "createdAt"
    `;

    const { rows } = await pool.query(sql, [
      messageId,
      fileName,
      filePath,
      fileSize,
      mimeType,
      encryptedKey,
    ]);
    return rows[0];
  } catch (error) {
    console.error("Error creating attachment:", error);
    throw error;
  }
};

/**
 * Get attachments for a message
 */
export const getAttachmentsByMessageId = async (messageId) => {
  try {
    const sql = `
      SELECT 
        id,
        message_id as "messageId",
        file_name as "fileName",
        file_path as "filePath",
        file_size as "fileSize",
        mime_type as "mimeType",
        encrypted_key as "encryptedKey",
        created_at as "createdAt"
      FROM message_attachments
      WHERE message_id = $1
      ORDER BY created_at ASC
    `;

    const { rows } = await pool.query(sql, [messageId]);
    return rows;
  } catch (error) {
    console.error("Error getting attachments:", error);
    throw error;
  }
};

/**
 * Get attachment by ID
 */
export const getAttachmentById = async (attachmentId) => {
  try {
    const sql = `
      SELECT 
        id,
        message_id as "messageId",
        file_name as "fileName",
        file_path as "filePath",
        file_size as "fileSize",
        mime_type as "mimeType",
        encrypted_key as "encryptedKey",
        created_at as "createdAt"
      FROM message_attachments
      WHERE id = $1
    `;

    const { rows } = await pool.query(sql, [attachmentId]);
    return rows[0];
  } catch (error) {
    console.error("Error getting attachment:", error);
    throw error;
  }
};

/**
 * Delete attachment
 */
export const deleteAttachment = async (attachmentId) => {
  try {
    const sql = `
      DELETE FROM message_attachments
      WHERE id = $1
      RETURNING id, file_path as "filePath"
    `;

    const { rows } = await pool.query(sql, [attachmentId]);
    return rows[0];
  } catch (error) {
    console.error("Error deleting attachment:", error);
    throw error;
  }
};

export default {
  findOrCreateDirectChat,
  getUserChats,
  getMessages,
  createMessage,
  getChatDetails,
  addChatMember,
  removeChatMember,
  deleteChat,
  createAttachment,
  getAttachmentsByMessageId,
  getAttachmentById,
  deleteAttachment,
};