import pool from "../config/db.js";

const HelpTicket = {
    create: async (ticketData) => {
        const { profileId, type, subject, description, priority = 'medium' } = ticketData;
        const result = await pool.query(
            `INSERT INTO help_tickets (profile_id, ticket_type, subject, description, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [profileId, type, subject, description, priority]
        );
        return result.rows[0];
    },

    addAttachment: async (attachmentData) => {
        const { ticketId, fileName, filePath, fileSize, mimeType } = attachmentData;
        const result = await pool.query(
            `INSERT INTO help_ticket_attachments (ticket_id, file_name, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [ticketId, fileName, filePath, fileSize, mimeType]
        );
        return result.rows[0];
    },

    getAll: async (filters = {}) => {
        let query = `
      SELECT t.*, 
             p.profile_type,
             json_agg(a.*) as attachments
      FROM help_tickets t
      LEFT JOIN profiles p ON t.profile_id = p.id
      LEFT JOIN help_ticket_attachments a ON t.id = a.ticket_id
    `;

        // Add filtering logic here if needed

        query += ` GROUP BY t.id, p.id ORDER BY t.created_at DESC`;

        const result = await pool.query(query);
        return result.rows;
    },

    getByProfileId: async (profileId) => {
        const result = await pool.query(
            `SELECT t.*, json_agg(json_build_object('file_name', a.file_name, 'file_path', a.file_path)) FILTER (WHERE a.id IS NOT NULL) as attachments
       FROM help_tickets t
       LEFT JOIN help_ticket_attachments a ON t.id = a.ticket_id
       WHERE t.profile_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
            [profileId]
        );
        return result.rows;
    },

    updateStatus: async (ticketId, status, adminNotes) => {
        const result = await pool.query(
            `UPDATE help_tickets 
       SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW(), resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
       WHERE id = $3
       RETURNING *`,
            [status, adminNotes, ticketId]
        );
        return result.rows[0];
    }
};

export default HelpTicket;
