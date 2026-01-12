import pool from "../config/db.js";

const DayWorkSummary = {
  // Create a new day work summary
  create: async (data) => {
    const {
      contract_id,
      expert_profile_id,
      work_date,
      total_hours,
      status = "pending",
    } = data;

    const query = `
      INSERT INTO day_work_summaries (
        contract_id,
        expert_profile_id,
        work_date,
        total_hours,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;

    const values = [contract_id, expert_profile_id, work_date, total_hours, status];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Get by ID
  getById: async (id) => {
    const query = `SELECT * FROM day_work_summaries WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get by contract ID
  getByContractId: async (contract_id) => {
    const query = `
      SELECT * FROM day_work_summaries 
      WHERE contract_id = $1 
      ORDER BY work_date DESC, created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Get by expert profile ID
  getByExpertProfileId: async (expert_profile_id) => {
    const query = `
      SELECT dws.*, c.project_id
      FROM day_work_summaries dws
      JOIN contracts c ON dws.contract_id = c.id
      WHERE dws.expert_profile_id = $1
      ORDER BY dws.work_date DESC, dws.created_at DESC
    `;
    const { rows } = await pool.query(query, [expert_profile_id]);
    return rows;
  },

  // Update status (approve/reject)
  updateStatus: async (id, status, reviewer_comment = null) => {
    const query = `
      UPDATE day_work_summaries 
      SET 
        status = $2,
        reviewer_comment = $3,
        approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [id, status, reviewer_comment]);
    return rows[0];
  },

  // Check for recent submissions (24-hour limit)
  getRecentForContract: async (contract_id, hours = 24) => {
    const query = `
      SELECT * FROM day_work_summaries 
      WHERE contract_id = $1 
        AND created_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  getByContractAndDate: async (contract_id, work_date) => {
    const query = `
      SELECT * FROM day_work_summaries 
      WHERE contract_id = $1 AND work_date = $2
    `;
    const { rows } = await pool.query(query, [contract_id, work_date]);
    return rows[0];
  },
};

export default DayWorkSummary;
