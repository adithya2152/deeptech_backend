import pool from '../config/db.js';

const WorkLog = {
    createLog: async (contractId, expertId, logData) => {
        const { date, hours, description, valueTags } = logData;
        const query = `
      INSERT INTO work_logs (contract_id, expert_id, log_date, hours_worked, description, value_tags)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, contract_id as "contractId", expert_id as "expertId", 
                log_date as date, hours_worked as hours, description, 
                value_tags as "valueTags", status, buyer_comment as "buyerComment", created_at as "createdAt";
    `;
        const { rows } = await pool.query(query, [contractId, expertId, date, hours, description, valueTags]);
        return rows[0];
    },

    getLogsByContract: async (contractId) => {
        const query = `
      SELECT id, contract_id as "contractId", expert_id as "expertId", 
             log_date as date, hours_worked as hours, description, 
             value_tags as "valueTags", status, buyer_comment as "buyerComment", created_at as "createdAt"
      FROM work_logs WHERE contract_id = $1 ORDER BY log_date DESC;
    `;
        const { rows } = await pool.query(query, [contractId]);
        return rows;
    },

    updateStatus: async (logId, status, comment) => {
        const query = `
      UPDATE work_logs SET status = $2, buyer_comment = $3 WHERE id = $1 
      RETURNING id, status, buyer_comment as "buyerComment";
    `;
        const { rows } = await pool.query(query, [logId, status, comment]);
        return rows[0];
    },

    getWeeklySummary: async (contractId, weekStart) => {
    const query = `
      SELECT 
        COALESCE(SUM(hours_worked), 0) as "totalHours",
        COALESCE(SUM(CASE WHEN status = 'approved' THEN hours_worked ELSE 0 END), 0) as "approvedHours",
        COALESCE(SUM(CASE WHEN status = 'submitted' THEN hours_worked ELSE 0 END), 0) as "pendingHours",
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN hours_worked ELSE 0 END), 0) as "rejectedHours"
      FROM work_logs 
      WHERE contract_id = $1 
      AND log_date >= $2::date 
      AND log_date < ($2::date + INTERVAL '7 days');
    `;
    const { rows } = await pool.query(query, [contractId, weekStart]);
    
    const contractQuery = `SELECT weekly_hour_cap FROM contracts WHERE id = $1`;
    const contractRes = await pool.query(contractQuery, [contractId]);
    const weeklyLimit = contractRes.rows[0]?.weekly_hour_cap || 0;

    const summary = rows[0];
    return {
      ...summary,
      weeklyLimit,
      remainingHours: Math.max(0, weeklyLimit - summary.totalHours)
    };
  }
};

export default WorkLog;