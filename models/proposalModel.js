import pool from "../config/db.js";

const Proposal = {
  // Create a new proposal (matches Supabase schema)
  create: async (data) => {
    const {
      project_id,
      expert_id,
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    } = data;

    const query = `
      INSERT INTO proposals (
        project_id,
        expert_id,
        engagement_model,
        rate,
        duration_days,
        sprint_count,
        quote_amount,
        message,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
      RETURNING *;
    `;

    const values = [
      project_id,
      expert_id,
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Get proposal by ID
  getById: async (id) => {
    const query = `
      SELECT p.*, 
        pr.title as project_title,
        prof.first_name as expert_first_name,
        prof.last_name as expert_last_name
      FROM proposals p
      JOIN projects pr ON p.project_id = pr.id
      JOIN profiles prof ON p.expert_id = prof.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get all proposals for a project
  getByProjectId: async (project_id) => {
  const query = `
    SELECT
      p.*,
      prof.first_name || ' ' || prof.last_name AS expert_name,
      prof.avatar_url AS expert_avatar
    FROM proposals p
    JOIN profiles prof ON p.expert_id = prof.id
    WHERE p.project_id = $1
    ORDER BY p.created_at DESC
  `;
  const { rows } = await pool.query(query, [project_id]);
  return rows;
},


  // Get all proposals by an expert
  getByExpertId: async (expert_id) => {
    const query = `
      SELECT p.*, 
        pr.title as project_title,
        pr.description as project_description,
        pr.budget_min,
        pr.budget_max
      FROM proposals p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.expert_id = $1
      ORDER BY p.created_at DESC
    `;
    const { rows } = await pool.query(query, [expert_id]);
    return rows;
  },

  // Update proposal
  update: async (id, data) => {
    const {
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    } = data;

    const query = `
      UPDATE proposals 
      SET 
        engagement_model = COALESCE($1, engagement_model),
        rate = COALESCE($2, rate),
        duration_days = COALESCE($3, duration_days),
        sprint_count = COALESCE($4, sprint_count),
        quote_amount = COALESCE($5, quote_amount),
        message = COALESCE($6, message),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
      id,
    ]);
    return rows[0];
  },

  // Update proposal status
  updateStatus: async (id, status) => {
    const query = `
      UPDATE proposals 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [status, id]);
    return rows[0];
  },

  // Delete proposal
  delete: async (id) => {
    const query = `DELETE FROM proposals WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },
};

export default Proposal;
