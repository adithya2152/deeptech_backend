import pool from "../config/db.js";

const WorkLog = {
  // Create a new work log (matches Supabase schema)
  create: async (data) => {
    const {
      contract_id,
      type,
      checklist,
      problems_faced,
      sprint_number,
      evidence,
    } = data;

    const query = `
      INSERT INTO work_logs (
        contract_id,
        type,
        checklist,
        problems_faced,
        sprint_number,
        evidence,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    const values = [
      contract_id,
      type,
      checklist ? JSON.stringify(checklist) : null,
      problems_faced,
      sprint_number,
      evidence ? JSON.stringify(evidence) : null,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Get work log by ID
  getById: async (id) => {
    const query = `SELECT * FROM work_logs WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get all work logs for a contract
  getByContractId: async (contract_id) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Get work logs by expert (via contract)
  getByExpertId: async (expert_id) => {
    const query = `
      SELECT wl.* 
      FROM work_logs wl
      JOIN contracts c ON wl.contract_id = c.id
      WHERE c.expert_id = $1
      ORDER BY wl.created_at DESC
    `;
    const { rows } = await pool.query(query, [expert_id]);
    return rows;
  },

  // Check for recent daily logs (24-hour limit)
  getRecentDailyLogs: async (contract_id) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
        AND type = 'daily_log'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Get sprint logs for a specific sprint
  getSprintLogs: async (contract_id, sprint_number) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
        AND sprint_number = $2
        AND type = 'sprint_submission'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id, sprint_number]);
    return rows;
  },

  // Update work log
  update: async (id, data) => {
    const { checklist, problems_faced, evidence } = data;

    const query = `
      UPDATE work_logs 
      SET 
        checklist = COALESCE($1, checklist),
        problems_faced = COALESCE($2, problems_faced),
        evidence = COALESCE($3, evidence)
      WHERE id = $4
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      checklist ? JSON.stringify(checklist) : null,
      problems_faced,
      evidence ? JSON.stringify(evidence) : null,
      id,
    ]);
    return rows[0];
  },

  // Delete work log
  delete: async (id) => {
    const query = `DELETE FROM work_logs WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },
};

export default WorkLog;
