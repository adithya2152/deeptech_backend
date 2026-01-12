import pool from '../config/db.js';

const Project = {
  getMarketplaceProjects: async (buyerProfileId = null) => {
    const params = [];
    const where = ["p.status IN ('open', 'active')"];
    if (buyerProfileId) {
      params.push(buyerProfileId);
      where.push(`p.buyer_profile_id = $${params.length}`);
    }

    const query = `
      SELECT p.*, 
             u.id as buyer_user_id,
             u.first_name as buyer_name, 
             u.last_name as buyer_last_name,
             b.billing_country as buyer_location,
             COALESCE(fb.rating, 0) as buyer_rating,
             COALESCE(fb.review_count, 0) as buyer_review_count,
             COALESCE(b.total_spent, 0) as buyer_total_spent,
             COALESCE(b.projects_posted, 0) as buyer_projects_posted,
             COALESCE(b.verified, false) as buyer_verified,
             (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count
      FROM projects p
      JOIN profiles bp ON p.buyer_profile_id = bp.id
      JOIN user_accounts u ON bp.user_id = u.id
      LEFT JOIN buyers b ON b.buyer_profile_id = p.buyer_profile_id
      LEFT JOIN (
        SELECT receiver_id,
               AVG(rating)::numeric(10,2) AS rating,
               COUNT(*)::int AS review_count
        FROM feedback
        WHERE receiver_id IS NOT NULL
          AND receiver_role = 'buyer'
        GROUP BY receiver_id
      ) fb ON fb.receiver_id = p.buyer_profile_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  },

  getProjectsByClient: async (profileId, role, status = null) => {
    const column = role === 'buyer' ? 'buyer_profile_id' : 'expert_profile_id';
    let sql = `SELECT * FROM projects WHERE ${column} = $1`;
    const params = [profileId];

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
        u.id as buyer_user_id,
        u.first_name || ' ' || u.last_name as buyer_name,
        u.avatar_url as buyer_avatar,
        u.created_at as buyer_joined_at,
        u.email_verified as buyer_email_verified,
        COALESCE(fb.rating, 0) as buyer_rating,
        COALESCE(fb.review_count, 0) as buyer_review_count,
        COALESCE(b.verified, false) as buyer_verified,
        COALESCE(b.projects_posted, 0) as buyer_projects_posted,
        COALESCE(b.total_spent, 0) as buyer_total_spent,
        COALESCE(b.hires_made, 0) as buyer_hires_made,
        b.billing_country as buyer_location,
        (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count,
        json_build_object(
          'id', bp.id, 
          'user_id', u.id,
          'first_name', u.first_name, 
          'last_name', u.last_name, 
          'email', u.email,
          'avatar_url', u.avatar_url,
          'location', b.billing_country,
          'created_at', u.created_at,
          'rating', COALESCE(fb.rating, 0),
          'review_count', COALESCE(fb.review_count, 0),
          'verified', COALESCE(b.verified, false),
          'verified_payment', COALESCE(b.verified, false),
          'verified_email', COALESCE(u.email_verified, false),
          'projects_posted', COALESCE(b.projects_posted, 0),
          'hires_made', COALESCE(b.hires_made, 0),
          'total_spent', COALESCE(b.total_spent, 0),
          'company_name', b.company_name
        ) as buyer
      FROM projects p
      JOIN profiles bp ON p.buyer_profile_id = bp.id
      JOIN user_accounts u ON bp.user_id = u.id
      LEFT JOIN buyers b ON b.buyer_profile_id = p.buyer_profile_id
      LEFT JOIN (
        SELECT receiver_id,
               AVG(rating)::numeric(10,2) AS rating,
               COUNT(*)::int AS review_count
        FROM feedback
        WHERE receiver_id IS NOT NULL
          AND receiver_role = 'buyer'
        GROUP BY receiver_id
      ) fb ON fb.receiver_id = p.buyer_profile_id
      WHERE p.id = $1;
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  },

  create: async (data) => {
    const {
      buyer_profile_id, title, description, domain, trl_level,
      expected_outcome, risk_categories, budget_min, budget_max, deadline,
      status
    } = data;

    const sql = `
      INSERT INTO projects (
        buyer_profile_id, title, description, domain, trl_level, 
        expected_outcome, risk_categories, budget_min, budget_max, deadline,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, 
        COALESCE($11, 'draft')
      )
      RETURNING *;
    `;

    const params = [
      buyer_profile_id, title, description, domain, trl_level,
      expected_outcome, risk_categories || [], budget_min, budget_max, deadline,
      status
    ];

    const { rows } = await pool.query(sql, params);
    return rows[0];
  },

  createProposal: async (projectId, expertProfileId, data) => {
    const { amount, duration, cover_letter, engagement_model = 'daily', rate } = data;

    const sql = `
      INSERT INTO proposals (
        project_id, 
        expert_profile_id,
        quote_amount,
        duration_days,
        message,
        engagement_model,
        rate,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *;
    `;

    const { rows } = await pool.query(sql, [
      projectId,
      expertProfileId,
      amount,
      duration,
      cover_letter,
      engagement_model,
      rate || amount
    ]);

    return rows[0];
  },

  getProjectProposals: async (projectId) => {
    const sql = `
      SELECT 
        pr.*,
        u.first_name || ' ' || u.last_name as expert_name,
        u.email as expert_email,
        u.avatar_url as expert_avatar
      FROM proposals pr
      JOIN profiles ep ON pr.expert_profile_id = ep.id
      JOIN user_accounts u ON ep.user_id = u.id
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
      updates.domain
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