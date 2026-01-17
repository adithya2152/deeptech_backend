import pool from "../config/db.js";

/**
 * Get notification counts for the current user (role-based counters).
 */
export const getNotificationCounts = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const role = req.user.role;

        let counts = {};

        if (role === 'buyer') {
            const proposalsResult = await pool.query(`
                SELECT COUNT(*) as count
                FROM proposals p
                JOIN projects pr ON p.project_id = pr.id
                WHERE pr.buyer_profile_id = $1
                  AND p.status = 'pending'
            `, [profileId]);

            const contractsResult = await pool.query(`
                SELECT COUNT(*) as count
                FROM contracts
                WHERE buyer_profile_id = $1
                  AND status = 'pending'
            `, [profileId]);

            counts = {
                projects: parseInt(proposalsResult.rows[0].count) || 0,
                contracts: parseInt(contractsResult.rows[0].count) || 0,
                messages: 0
            };
        } else if (role === 'expert') {
            const contractsResult = await pool.query(`
                SELECT COUNT(*) as count
                FROM contracts
                WHERE expert_profile_id = $1
                  AND status = 'pending'
            `, [profileId]);

            const invitationsResult = await pool.query(`
                SELECT COUNT(*) as count
                FROM project_invitations
                WHERE expert_profile_id = $1
                  AND status = 'pending'
            `, [profileId]);

            const invitationsCount = parseInt(invitationsResult.rows[0].count) || 0;

            counts = {
                marketplace: 0,
                proposals: invitationsCount,
                invitations: invitationsCount,
                contracts: parseInt(contractsResult.rows[0].count) || 0,
                messages: 0
            };
        }

        return res.json({ success: true, data: counts });
    } catch (error) {
        console.error('getNotificationCounts error:', error);
        return res.status(500).json({ success: false, message: 'Failed to get notification counts' });
    }
};

/**
 * Get all notifications for the current profile (role-based).
 */
export const getNotifications = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = parseInt(req.query.offset, 10) || 0;

        const { rows: notifications } = await pool.query(`
            SELECT * FROM notifications
            WHERE profile_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [profileId, limit, offset]);

        const { rows: countResult } = await pool.query(`
            SELECT COUNT(*) as count FROM notifications
            WHERE profile_id = $1 AND is_read = false
        `, [profileId]);

        res.json({
            success: true,
            data: notifications,
            unreadCount: parseInt(countResult[0].count, 10) || 0
        });
    } catch (error) {
        console.error('getNotifications error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
};

/**
 * Get unread notification count for navbar badge.
 */
export const getUnreadCount = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const { rows } = await pool.query(`
            SELECT COUNT(*) as count FROM notifications
            WHERE profile_id = $1 AND is_read = false
        `, [profileId]);

        res.json({
            success: true,
            count: parseInt(rows[0].count, 10) || 0
        });
    } catch (error) {
        console.error('getUnreadCount error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
    }
};

/**
 * Mark a single notification as read.
 */
export const markAsRead = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const { id } = req.params;

        const { rows } = await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE id = $1 AND profile_id = $2
            RETURNING *
        `, [id, profileId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('markAsRead error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark as read' });
    }
};

/**
 * Mark all notifications as read.
 */
export const markAllAsRead = async (req, res) => {
    try {
        const profileId = req.user.profileId;

        const { rowCount } = await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE profile_id = $1 AND is_read = false
        `, [profileId]);

        res.json({
            success: true,
            message: `Marked ${rowCount} notifications as read`,
            markedCount: rowCount
        });
    } catch (error) {
        console.error('markAllAsRead error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark all as read' });
    }
};

/**
 * Delete all notifications for the current user.
 */
export const deleteAllNotifications = async (req, res) => {
    try {
        const profileId = req.user.profileId;

        const { rowCount } = await pool.query(`
            DELETE FROM notifications
            WHERE profile_id = $1
        `, [profileId]);

        res.json({
            success: true,
            message: `Deleted ${rowCount} notifications`,
            deletedCount: rowCount
        });
    } catch (error) {
        console.error('deleteAllNotifications error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete all notifications' });
    }
};

// =============================================
// NOTIFICATION CREATION HELPERS (for internal use)
// =============================================

/**
 * Create a notification for a specific profile.
 */
export const createNotification = async (profileId, type, title, message, link = null) => {
    try {
        const { rows } = await pool.query(`
            INSERT INTO notifications (profile_id, type, title, message, link)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [profileId, type, title, message, link]);
        return rows[0];
    } catch (error) {
        console.error('createNotification error:', error);
        return null;
    }
};

// =============================================
// BUYER NOTIFICATIONS
// =============================================

/**
 * Notify buyer when they receive a new proposal.
 */
export const notifyBuyerProposalReceived = async (buyerProfileId, expertName, projectTitle, projectId) => {
    return createNotification(
        buyerProfileId,
        'proposal_received',
        'New Proposal',
        `${expertName} submitted a proposal for "${projectTitle}"`,
        `/projects/${projectId}/proposals`
    );
};

/**
 * Notify buyer when expert accepts contract.
 */
export const notifyBuyerContractAccepted = async (buyerProfileId, expertName, projectTitle, contractId) => {
    return createNotification(
        buyerProfileId,
        'contract_accepted',
        'Contract Accepted',
        `${expertName} accepted the contract for "${projectTitle}"`,
        `/contracts/${contractId}`
    );
};

/**
 * Notify buyer when expert marks work as complete.
 */
export const notifyBuyerWorkCompleted = async (buyerProfileId, expertName, projectTitle, contractId) => {
    return createNotification(
        buyerProfileId,
        'work_completed',
        'Work Completed',
        `${expertName} marked "${projectTitle}" as complete`,
        `/contracts/${contractId}`
    );
};

// =============================================

/**
 * Notify when a contract is signed.
 */
export const notifyContractSigned = async (recipientProfileId, signerName, projectTitle, contractId, isFullySigned) => {
    const title = isFullySigned ? "Contract Fully Signed" : "Contract Signed";
    const message = isFullySigned
        ? `The agreement for "${projectTitle}" is fully signed. Proceed to NDA/Activation.`
        : `${signerName} has signed the agreement for "${projectTitle}". Please sign to proceed.`;

    return createNotification(
        recipientProfileId,
        'contract_signed',
        title,
        message,
        `/contracts/${contractId}`
    );
};

// =============================================
// EXPERT NOTIFICATIONS
// =============================================

/**
 * Notify expert when their proposal is accepted.
 */
export const notifyExpertProposalAccepted = async (expertProfileId, projectTitle, projectId) => {
    return createNotification(
        expertProfileId,
        'proposal_accepted',
        'Proposal Accepted! 🎉',
        `Your proposal for "${projectTitle}" was accepted`,
        `/projects/${projectId}`
    );
};

/**
 * Notify expert when their proposal is declined.
 */
export const notifyExpertProposalDeclined = async (expertProfileId, projectTitle, projectId) => {
    return createNotification(
        expertProfileId,
        'proposal_declined',
        'Proposal Declined',
        `Your proposal for "${projectTitle}" was declined`,
        `/projects/${projectId}`
    );
};

/**
 * Notify expert when a project they bid on is closed.
 */
export const notifyExpertProjectClosed = async (expertProfileId, projectTitle, projectId) => {
    return createNotification(
        expertProfileId,
        'project_closed',
        'Project Closed',
        `"${projectTitle}" is no longer accepting proposals`,
        `/projects/${projectId}`
    );
};

/**
 * Notify expert when they receive a contract offer.
 */
export const notifyExpertContractReceived = async (expertProfileId, buyerName, projectTitle, contractId) => {
    return createNotification(
        expertProfileId,
        'contract_received',
        'New Contract Offer',
        `${buyerName} sent you a contract for "${projectTitle}"`,
        `/contracts/${contractId}`
    );
};

/**
 * Notify expert when they receive payment.
 */
export const notifyExpertPaymentReceived = async (expertProfileId, amount, projectTitle, contractId) => {
    return createNotification(
        expertProfileId,
        'payment_received',
        'Payment Received 💰',
        `You received $${amount.toLocaleString()} for "${projectTitle}"`,
        `/contracts/${contractId}`
    );
};

/**
 * Notify expert when they receive a project invitation.
 */
export const notifyExpertInvitationReceived = async (expertProfileId, buyerName, projectTitle, projectId) => {
    return createNotification(
        expertProfileId,
        'invitation_received',
        'Project Invitation',
        `${buyerName} invited you to bid on "${projectTitle}"`,
        `/projects/${projectId}`
    );
};

/**
 * Notify all experts who bid on a project when status changes.
 */
export const notifyProjectExperts = async (projectId, type, title, message, link = null) => {
    try {
        const { rows: experts } = await pool.query(`
            SELECT DISTINCT p.id as profile_id
            FROM proposals pr
            JOIN profiles p ON p.id = pr.expert_profile_id
            WHERE pr.project_id = $1
        `, [projectId]);

        const notifications = [];
        for (const expert of experts) {
            const notification = await createNotification(expert.profile_id, type, title, message, link);
            if (notification) notifications.push(notification);
        }
        return notifications;
    } catch (error) {
        console.error('notifyProjectExperts error:', error);
        return [];
    }
};
