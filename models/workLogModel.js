import pool from '../config/db.js';

const WorkLog = {
  createLog: async (contract_id, expert_id, log_data) => {
    const { log_date, hours_worked, description, value_tags } = log_data;

    // 1. Insert the log with 'submitted' status
    const query = `
      INSERT INTO hour_logs (contract_id, expert_id, log_date, hours_worked, description, value_tags, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
      RETURNING *;
    `;
    
    const { rows } = await pool.query(query, [
      contract_id,
      expert_id,
      log_date,
      hours_worked,
      description,
      value_tags
    ]);

    // ❌ REMOVED: Do not update contract totals here. 
    // We only update totals when the Buyer approves the log.

    return rows[0];
  },

  // ✅ UPDATED: Accepts userId to allow both Buyer and Expert to view logs
  getLogsByContract: async (contract_id, userId) => {
    const query = `
      SELECT hl.*
      FROM hour_logs hl
      JOIN contracts c ON hl.contract_id = c.id
      WHERE hl.contract_id = $1 
      AND (c.buyer_id = $2 OR c.expert_id = $2) -- ✅ Check permission for both
      ORDER BY hl.log_date DESC;
    `;
    const { rows } = await pool.query(query, [contract_id, userId]);
    return rows;
  },

  updateStatus: async (log_id, status, reason = null) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update the log status
      const query = `
        UPDATE hour_logs 
        SET status = $2, rejection_reason = $3 
        WHERE id = $1 
        RETURNING *;
      `;
      const { rows } = await client.query(query, [log_id, status, reason]);
      const log = rows[0];

      // 2. ✅ CRITICAL: If approved, NOW we update the contract totals
      if (status === 'approved' && log) {
        const updateContractSql = `
          UPDATE contracts 
          SET total_hours_logged = total_hours_logged + $2,
              total_amount = total_amount + (hourly_rate * $2)
          WHERE id = $1;
        `;
        await client.query(updateContractSql, [log.contract_id, log.hours_worked]);
      }

      await client.query('COMMIT');
      return log;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  getWeeklySummary: async (contract_id, week_start) => {
    const query = `
      SELECT 
        COALESCE(SUM(hours_worked), 0) as total_hours,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN hours_worked ELSE 0 END), 0) as approved_hours,
        COALESCE(SUM(CASE WHEN status = 'submitted' THEN hours_worked ELSE 0 END), 0) as pending_hours,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN hours_worked ELSE 0 END), 0) as rejected_hours
      FROM hour_logs 
      WHERE contract_id = $1 
      AND log_date >= $2::date 
      AND log_date < ($2::date + INTERVAL '7 days');
    `;
    const { rows } = await pool.query(query, [contract_id, week_start]);

    const contract_query = `SELECT weekly_hour_cap FROM contracts WHERE id = $1`;
    const contract_res = await pool.query(contract_query, [contract_id]);
    const weekly_limit = contract_res.rows[0]?.weekly_hour_cap || 0;

    const summary = rows[0];
    return {
      ...summary,
      weekly_limit,
      remaining_hours: Math.max(0, weekly_limit - summary.total_hours)
    };
  }
};

export default WorkLog;