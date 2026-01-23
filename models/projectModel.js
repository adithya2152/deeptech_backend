import pool from '../config/db.js';

const Project = {
  getMarketplaceProjects: async (buyerProfileId = null, viewerExpertProfileId = null) => {
    const params = [];
    const where = ["p.status IN ('open', 'active')"];
    if (buyerProfileId) {
      params.push(buyerProfileId);
      where.push(`p.buyer_profile_id = $${params.length}`);
    }

    let myProposalSelect = `NULL::text as my_proposal_status`;
    if (viewerExpertProfileId) {
      params.push(viewerExpertProfileId);
      myProposalSelect = `(
        SELECT pr.status
        FROM proposals pr
        WHERE pr.project_id = p.id AND pr.expert_profile_id = $${params.length}
        ORDER BY pr.created_at DESC
        LIMIT 1
      ) as my_proposal_status`;
    }

    const query = `
      SELECT p.*, 
             u.id as buyer_user_id,
             u.first_name as buyer_name, 
             u.last_name as buyer_last_name,
             b.billing_country as buyer_location,
             COALESCE(fb.rating, 0) as buyer_rating,
             COALESCE(fb.review_count, 0) as buyer_review_count,
             (
               SELECT COALESCE(SUM(i.amount), 0)
               FROM invoices i
               WHERE i.buyer_profile_id = p.buyer_profile_id
                 AND i.status = 'paid'
             ) as buyer_total_spent,
             (
               SELECT COUNT(*)
               FROM projects p2
               WHERE p2.buyer_profile_id = p.buyer_profile_id
             )::int as buyer_projects_posted,
             (
               SELECT COUNT(*)
               FROM contracts c2
               WHERE c2.buyer_profile_id = p.buyer_profile_id
                 AND c2.status NOT IN ('declined')
             )::int as buyer_contracts_count,
             COALESCE(b.verified, false) as buyer_verified,
             (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count,
             ${myProposalSelect}
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
    if (role === 'buyer') {
      let sql = `
        SELECT
          p.*,
          (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count,
          (
            SELECT c.id
            FROM contracts c
            WHERE c.project_id = p.id
              AND c.status IN ('pending', 'active', 'paused')
            ORDER BY c.created_at DESC
            LIMIT 1
          ) as active_contract_id,
          (
            SELECT c.status
            FROM contracts c
            WHERE c.project_id = p.id
              AND c.status IN ('pending', 'active', 'paused')
            ORDER BY c.created_at DESC
            LIMIT 1
          ) as active_contract_status
        FROM projects p
        WHERE p.buyer_profile_id = $1
      `;
      const params = [profileId];

      if (status && status !== 'all') {
        sql += ` AND p.status = $2`;
        params.push(status);
      }

      sql += ` ORDER BY p.created_at DESC`;
      const { rows } = await pool.query(sql, params);
      return rows;
    }

    if (role === 'expert') {
      let sql = `
        SELECT DISTINCT p.* 
        FROM projects p
        JOIN contracts c ON p.id = c.project_id
        WHERE c.expert_profile_id = $1
      `;
      const params = [profileId];

      if (status && status !== 'all') {
        sql += ` AND p.status = $2`;
        params.push(status);
      }

      sql += ` ORDER BY p.created_at DESC`;
      const { rows } = await pool.query(sql, params);
      return rows;
    }

    return [];
  },

  getById: async (id, viewerExpertProfileId = null) => {
    const params = [id];
    let myProposalSelect = `NULL::text as my_proposal_status`;
    if (viewerExpertProfileId) {
      params.push(viewerExpertProfileId);
      myProposalSelect = `(
        SELECT pr.status
        FROM proposals pr
        WHERE pr.project_id = p.id AND pr.expert_profile_id = $${params.length}
        ORDER BY pr.created_at DESC
        LIMIT 1
      ) as my_proposal_status`;
    }

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
        (
          SELECT COUNT(*)
          FROM projects p2
          WHERE p2.buyer_profile_id = p.buyer_profile_id
        )::int as buyer_projects_posted,
        (
          SELECT COALESCE(SUM(i.amount), 0)
          FROM invoices i
          WHERE i.buyer_profile_id = p.buyer_profile_id
            AND i.status = 'paid'
        ) as buyer_total_spent,
        (
          SELECT COUNT(*)
          FROM contracts c2
          WHERE c2.buyer_profile_id = p.buyer_profile_id
            AND c2.status NOT IN ('declined')
        )::int as buyer_contracts_count,
        (
          SELECT COUNT(*)
          FROM contracts c2
          WHERE c2.buyer_profile_id = p.buyer_profile_id
            AND c2.status NOT IN ('declined')
        )::int as buyer_hires_made,
        b.billing_country as buyer_location,
        (SELECT COUNT(*) FROM proposals WHERE project_id = p.id) as proposal_count,
        (SELECT json_build_object(
          'avg_rate', COALESCE(AVG(COALESCE(rate, quote_amount)), 0),
          'min_rate', COALESCE(MIN(COALESCE(rate, quote_amount)), 0),
          'max_rate', COALESCE(MAX(COALESCE(rate, quote_amount)), 0)
        ) FROM proposals WHERE project_id = p.id) as proposal_stats,
        ${myProposalSelect},
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
          'projects_posted', (
            SELECT COUNT(*)
            FROM projects p2
            WHERE p2.buyer_profile_id = p.buyer_profile_id
          )::int,
          'contracts_count', (
            SELECT COUNT(*)
            FROM contracts c2
            WHERE c2.buyer_profile_id = p.buyer_profile_id
              AND c2.status NOT IN ('declined')
          )::int,
          'hires_made', (
            SELECT COUNT(*)
            FROM contracts c2
            WHERE c2.buyer_profile_id = p.buyer_profile_id
              AND c2.status NOT IN ('declined')
          )::int,
          'total_spent', (
            SELECT COALESCE(SUM(i.amount), 0)
            FROM invoices i
            WHERE i.buyer_profile_id = p.buyer_profile_id
              AND i.status = 'paid'
          ),
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
    const { rows } = await pool.query(sql, params);
    return rows[0];
  },

  create: async (data) => {
    const {
      buyer_profile_id, title, description, domain, trl_level,
      expected_outcome, risk_categories, budget_min, budget_max, deadline,
      status,
      currency
    } = data;

    const sql = `
      INSERT INTO projects (
        buyer_profile_id, title, description, domain, trl_level, 
        expected_outcome, risk_categories, budget_min, budget_max, deadline,
        status,
        currency
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, 
        COALESCE($11, 'draft'),
        COALESCE($12, 'INR')
      )
      RETURNING *;
    `;

    const params = [
      buyer_profile_id, title, description, domain, trl_level,
      expected_outcome, risk_categories || [], budget_min, budget_max, deadline,
      status,
      currency
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
        currency,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT currency FROM projects WHERE id = $1), 'pending')
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
          currency = COALESCE($12, currency),
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
      updates.currency
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