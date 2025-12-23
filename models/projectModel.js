import pool from '../config/db.js';

const Project = {
  getMarketplaceProjects: async () => {
    const query = `
      SELECT p.*, 
             u.first_name as buyer_name, 
             u.last_name as buyer_last_name,
             (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count
      FROM projects p
      JOIN profiles u ON p.buyer_id = u.id
      WHERE p.status IN ('open', 'active')
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  getProjectsByClient: async (userId, role, status = null) => {
    const column = role === 'buyer' ? 'buyer_id' : 'expert_id';
    let sql = `SELECT * FROM projects WHERE ${column} = $1`;
    const params = [userId];

    if (status && status !== 'all') {
      sql += ` AND status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(sql, params);
    return rows;
  },

  getById: async (id) => {
    const sql = `
      SELECT 
        p.*, 
        json_build_object(
          'id', u.id, 
          'first_name', u.first_name, 
          'last_name', u.last_name, 
          'email', u.email
        ) as buyer
      FROM projects p
      LEFT JOIN profiles u ON p.buyer_id = u.id 
      WHERE p.id = $1;
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  },

  create: async (data) => {
    const {
      buyer_id, title, description, domain, trl_level,
      expected_outcome, risk_categories, budget_min, budget_max, deadline,
      status
    } = data;

    const sql = `
      INSERT INTO projects (
        buyer_id, title, description, domain, trl_level, 
        expected_outcome, risk_categories, budget_min, budget_max, deadline,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, 
        COALESCE($11, 'draft') -- Defaults to 'draft' if status is null/undefined
      )
      RETURNING *;
    `;

    const params = [
      buyer_id, title, description, domain, trl_level,
      expected_outcome, risk_categories || [], budget_min, budget_max, deadline,
      status
    ];

    const { rows } = await pool.query(sql, params);
    return rows[0];
  },

  createProposal: async (projectId, expertId, data) => {
    const { amount, duration, cover_letter } = data;

    const sql = `
      INSERT INTO proposals (
        project_id, 
        expert_id,
        quote_amount,
        duration_days,
        message,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *;
    `;

    const { rows } = await pool.query(sql, [
      projectId,
      expertId,
      amount,
      duration,
      cover_letter
    ]);

    return rows[0];
  },

  getProjectProposals: async (projectId) => {
    const sql = `
      SELECT 
        pr.*,
        p.first_name || ' ' || p.last_name as expert_name,
        p.email as expert_email,
        p.avatar_url as expert_avatar
      FROM proposals pr
      JOIN profiles p ON pr.expert_id = p.id
      WHERE pr.project_id = $1
      AND pr.status = 'pending'
      ORDER BY pr.created_at DESC;
    `;
    const { rows } = await pool.query(sql, [projectId]);
    return rows;
  },

  update: async (id, updates) => {
    const sql = `
      UPDATE projects 
      SET title = COALESCE($2, title),
          description = COALESCE($3, description),
          status = COALESCE($4, status),
          trl_level = COALESCE($5, trl_level),
          expected_outcome = COALESCE($6, expected_outcome),
          budget_min = COALESCE($7, budget_min),
          budget_max = COALESCE($8, budget_max),
          deadline = COALESCE($9, deadline),
          risk_categories = COALESCE($10, risk_categories)::text[],
          domain = COALESCE($11, domain),
          expert_id = COALESCE($12, expert_id),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const params = [
      id,
      updates.title,
      updates.description,
      updates.status,
      updates.trl_level,
      updates.expected_outcome,
      updates.budget_min,
      updates.budget_max,
      updates.deadline,
      updates.risk_categories,
      updates.domain,
      updates.expert_id
    ];

    const { rows } = await pool.query(sql, params);
    return rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM projects WHERE id = $1 RETURNING id`;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  }
};

export default Project;