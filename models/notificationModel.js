import pool from "../config/db.js";

const NotificationModel = {
    /**
     * Create a new notification
     */
        create: async (profileId, type, title, message, link = null) => {
                const sql = `
            INSERT INTO notifications (profile_id, type, title, message, link)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
                const { rows } = await pool.query(sql, [profileId, type, title, message, link]);
                return rows[0];
        },

    /**
     * Create notifications for all experts who bid on a project
     */
    notifyProjectExperts: async (projectId, type, title, message, link = null) => {
        // Get all experts who have submitted proposals for this project
        const { rows: experts } = await pool.query(
                `SELECT DISTINCT p.id as profile_id 
       FROM proposals pr
       JOIN profiles p ON p.id = pr.expert_profile_id
       WHERE pr.project_id = $1`,
            [projectId]
        );

        if (experts.length === 0) return [];

        // Create notifications for each expert
        const notifications = [];
        for (const expert of experts) {
                const notification = await NotificationModel.create(
                    expert.profile_id,
                type,
                title,
                message,
                link
            );
            notifications.push(notification);
        }

        return notifications;
    },

    /**
     * Get notifications for a user (newest first)
     */
    getByUserId: async (userId, limit = 20, offset = 0) => {
        const sql = `
      SELECT *
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const { rows } = await pool.query(sql, [userId, limit, offset]);
        return rows;
    },

    /**
     * Get unread count for a user
     */
    getUnreadCount: async (userId) => {
        const sql = `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `;
        const { rows } = await pool.query(sql, [userId]);
        return parseInt(rows[0].count, 10);
    },

    /**
     * Mark a single notification as read
     */
    markAsRead: async (notificationId, userId) => {
        const sql = `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
        const { rows } = await pool.query(sql, [notificationId, userId]);
        return rows[0];
    },

    /**
     * Mark all notifications as read for a user
     */
    markAllAsRead: async (userId) => {
        const sql = `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
      RETURNING id
    `;
        const { rows } = await pool.query(sql, [userId]);
        return rows.length;
    },

    /**
     * Delete old notifications (older than 30 days)
     */
    deleteOld: async (daysOld = 30) => {
        const sql = `
      DELETE FROM notifications
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      RETURNING id
    `;
        const { rows } = await pool.query(sql);
        return rows.length;
    },
};

export default NotificationModel;
