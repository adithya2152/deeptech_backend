import pool from "../config/db.js";

const Proposal = {
  // Create or reuse a proposal (enforces 1 per project+expert_profile)
  create: async (data) => {
    const {
      project_id,
      expert_profile_id,
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    } = data;

    // 1) Check if a proposal already exists for this project+expert_profile
    const existingRes = await pool.query(
      `
    SELECT *
    FROM proposals
    WHERE project_id = $1 AND expert_profile_id = $2
    LIMIT 1
    `,
      [project_id, expert_profile_id]
    );

    const existing = existingRes.rows[0];

    if (existing) {
      // 2) Update existing proposal instead of inserting a new one
      const updateRes = await pool.query(
        `
      UPDATE proposals 
      SET 
        engagement_model = $1,
        rate = $2,
        duration_days = $3,
        sprint_count = $4,
        quote_amount = $5,
        message = $6,
        status = 'pending',
        updated_at = NOW()
      WHERE id = $7
      RETURNING *;
      `,
        [
          engagement_model,
          rate,
          duration_days,
          sprint_count,
          quote_amount,
          message,
          existing.id,
        ]
      );
      return updateRes.rows[0];
    }

    // 3) If no existing proposal, insert a new one
    const insertQuery = `
    INSERT INTO proposals (
      project_id,
      expert_profile_id,
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
      expert_profile_id,
      engagement_model,
      rate,
      duration_days,
      sprint_count,
      quote_amount,
      message,
    ];

    const { rows } = await pool.query(insertQuery, values);
    return rows[0];
  },

  getById: async (id) => {
    const query = `
      SELECT p.*, 
        pr.title as project_title,
        u.first_name as expert_first_name,
        u.last_name as expert_last_name
      FROM proposals p
      JOIN projects pr ON p.project_id = pr.id
      JOIN profiles prof ON p.expert_profile_id = prof.id
      JOIN user_accounts u ON prof.user_id = u.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getByProjectId: async (project_id) => {
    const query = `
      SELECT
        p.*,
        u.id AS expert_user_id,
        u.first_name || ' ' || u.last_name AS expert_name,
        u.avatar_url AS expert_avatar
      FROM proposals p
      JOIN profiles prof ON p.expert_profile_id = prof.id
      JOIN user_accounts u ON prof.user_id = u.id
      WHERE p.project_id = $1
        AND p.status = 'pending'
      ORDER BY p.created_at DESC
    `;
    const { rows } = await pool.query(query, [project_id]);
    return rows;
  },

  getByExpertProfileId: async (expert_profile_id) => {
    const query = `
      SELECT p.*, 
        pr.title as project_title,
        pr.description as project_description,
        pr.budget_min,
        pr.budget_max
      FROM proposals p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.expert_profile_id = $1
      ORDER BY p.created_at DESC
    `;
    const { rows } = await pool.query(query, [expert_profile_id]);
    return rows;
  },

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

  delete: async (id) => {
    const query = `DELETE FROM proposals WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },
};

export default Proposal;
