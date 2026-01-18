import pool from "../config/db.js";

/**
 * Time Entry Model for hourly engagement contracts
 */
const TimeEntry = {
    /**
     * Create a new time entry
     */
    async create({
        contractId,
        expertProfileId,
        description,
        startTime,
        endTime,
        durationMinutes,
        hourlyRate,
    }) {
        const result = await pool.query(
            `INSERT INTO time_entries (
        contract_id, expert_profile_id, description, 
        start_time, end_time, duration_minutes, hourly_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
            [
                contractId,
                expertProfileId,
                description,
                startTime,
                endTime || null,
                durationMinutes || null,
                hourlyRate,
            ]
        );
        return result.rows[0];
    },

    /**
     * Get time entry by ID
     */
    async getById(id) {
        const result = await pool.query(
            `SELECT * FROM time_entries WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get all time entries for a contract
     */
    async getByContractId(contractId) {
        const result = await pool.query(
            `SELECT te.*, 
              ua.first_name as expert_first_name,
              ua.last_name as expert_last_name
       FROM time_entries te
       LEFT JOIN profiles p ON te.expert_profile_id = p.id
       LEFT JOIN user_accounts ua ON p.user_id = ua.id
       WHERE te.contract_id = $1
       ORDER BY te.start_time DESC`,
            [contractId]
        );
        return result.rows;
    },

    /**
     * Get pending time entries for a contract (for buyer review)
     */
    async getPendingByContractId(contractId) {
        const result = await pool.query(
            `SELECT te.*, 
              ua.first_name as expert_first_name,
              ua.last_name as expert_last_name
       FROM time_entries te
       LEFT JOIN profiles p ON te.expert_profile_id = p.id
       LEFT JOIN user_accounts ua ON p.user_id = ua.id
       WHERE te.contract_id = $1 AND te.status = 'submitted'
       ORDER BY te.start_time DESC`,
            [contractId]
        );
        return result.rows;
    },

    /**
     * Get time entries by expert profile
     */
    async getByExpertProfileId(expertProfileId) {
        const result = await pool.query(
            `SELECT te.*, c.engagement_model, p.title as project_title
       FROM time_entries te
       LEFT JOIN contracts c ON te.contract_id = c.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE te.expert_profile_id = $1
       ORDER BY te.start_time DESC`,
            [expertProfileId]
        );
        return result.rows;
    },

    /**
     * Update a time entry (only drafts can be updated)
     */
    async update(id, { description, startTime, endTime, durationMinutes }) {
        const result = await pool.query(
            `UPDATE time_entries 
       SET description = COALESCE($2, description),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time),
           duration_minutes = COALESCE($5, duration_minutes),
           updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
            [id, description, startTime, endTime, durationMinutes]
        );
        return result.rows[0] || null;
    },

    /**
     * Submit time entry for approval
     */
    async submit(id) {
        const result = await pool.query(
            `UPDATE time_entries 
       SET status = 'submitted', updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Approve time entry
     */
    async approve(id, reviewerComment = null) {
        const result = await pool.query(
            `UPDATE time_entries 
       SET status = 'approved', 
           approved_at = NOW(),
           reviewer_comment = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'submitted'
       RETURNING *`,
            [id, reviewerComment]
        );
        return result.rows[0] || null;
    },

    /**
     * Reject time entry
     */
    async reject(id, reviewerComment) {
        const result = await pool.query(
            `UPDATE time_entries 
       SET status = 'rejected', 
           reviewer_comment = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'submitted'
       RETURNING *`,
            [id, reviewerComment]
        );
        return result.rows[0] || null;
    },

    /**
     * Delete a time entry (only drafts can be deleted)
     */
    async delete(id) {
        const result = await pool.query(
            `DELETE FROM time_entries WHERE id = $1 AND status = 'draft' RETURNING id`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get summary of approved hours for a contract
     */
    async getApprovedSummary(contractId) {
        const result = await pool.query(
            `SELECT 
         COUNT(*) as total_entries,
         SUM(duration_minutes) as total_minutes,
         SUM(duration_minutes / 60.0 * hourly_rate) as total_amount
       FROM time_entries
       WHERE contract_id = $1 AND status = 'approved'`,
            [contractId]
        );
        return result.rows[0];
    },

    /**
     * Get unbilled approved time entries (for invoice generation)
     */
    async getUnbilledApproved(contractId) {
        const result = await pool.query(
            `SELECT * FROM time_entries
       WHERE contract_id = $1 
         AND status = 'approved'
         AND id NOT IN (
           SELECT source_id FROM invoices 
           WHERE source_type = 'time_entry' AND contract_id = $1
         )
       ORDER BY start_time ASC`,
            [contractId]
        );
        return result.rows;
    },
};

export default TimeEntry;
