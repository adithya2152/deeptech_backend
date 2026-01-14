import pool from "../config/db.js";

/**
 * Get notification counts for the current user.
 * Returns counts based on role:
 * - Buyer: pending proposals on their projects, pending contracts
 * - Expert: pending contract offers, unread proposal updates
 */
export const getNotificationCounts = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const role = req.user.role;

        let counts = {};

        if (role === 'buyer') {
            // Count pending proposals across buyer's projects
            const proposalsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM proposals p
        JOIN projects pr ON p.project_id = pr.id
        WHERE pr.buyer_profile_id = $1
          AND p.status = 'pending'
      `, [profileId]);

            // Count pending contracts (waiting for expert to sign NDA)
            const contractsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM contracts
        WHERE buyer_profile_id = $1
          AND status = 'pending'
      `, [profileId]);

            counts = {
                projects: parseInt(proposalsResult.rows[0].count) || 0,
                contracts: parseInt(contractsResult.rows[0].count) || 0,
                messages: 0 // TODO: Implement unread message count
            };
        } else if (role === 'expert') {
            // Count pending contract offers for expert
            const contractsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM contracts
        WHERE expert_profile_id = $1
          AND status = 'pending'
      `, [profileId]);

            // Count pending invitations for expert
            const invitationsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM project_invitations
        WHERE expert_profile_id = $1
          AND status = 'pending'
      `, [profileId]);

            const invitationsCount = parseInt(invitationsResult.rows[0].count) || 0;

            counts = {
                marketplace: 0, // TODO: Could be new matching projects
                // Backwards compatible: keep proposals key but map it to invitations.
                proposals: invitationsCount,
                invitations: invitationsCount,
                contracts: parseInt(contractsResult.rows[0].count) || 0,
                messages: 0 // TODO: Implement unread message count
            };
        }

        return res.json({
            success: true,
            data: counts
        });
    } catch (error) {
        console.error('getNotificationCounts error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get notification counts'
        });
    }
};
