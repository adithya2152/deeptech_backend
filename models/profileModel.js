import pool from "../config/db.js";

const ProfileModel = {
  ensureBuyerRow: async (userId) => {
    await pool.query(
      `INSERT INTO buyers (id) VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [userId]
    );
  },

  getBaseProfileById: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT
        id, email, first_name, last_name, username, role,
        avatar_url, banner_url, timezone, profile_completion, 
        created_at, updated_at, last_login, email_verified
      FROM profiles
      WHERE id = $1
      `,
      [userId]
    );
    return rows[0];
  },

  getExpertProfileById: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT
        domains,
        experience_summary,
        skills,
        avg_daily_rate,
        avg_fixed_rate,
        avg_sprint_rate,
        preferred_engagement_mode,
        languages,
        years_experience,
        availability_status,
        portfolio_url,
        profile_video_url,
        linkedin_url,
        github_url,
        rating,
        review_count,
        total_hours,
        expert_status,
        is_profile_complete
      FROM experts
      WHERE id = $1
      `,
      [userId]
    );
    return rows[0];
  },

  getExpertHasResume: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT 1
      FROM expert_documents
      WHERE expert_id = $1 AND document_type = 'resume'
      LIMIT 1
      `,
      [userId]
    );
    return rows.length > 0;
  },

  getBuyerProfileById: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT
        company_name,
        company_description,
        company_size,
        industry,
        website,
        billing_country,
        client_type,
        social_proof,
        company_website,
        vat_id,
        total_spent,
        projects_posted,
        hires_made,
        avg_contract_value,
        preferred_engagement_model,
        verified
      FROM buyers
      WHERE id = $1
      `,
      [userId]
    );
    return rows[0];
  },

  updateBaseProfile: async (userId, data) => {
    const allowed = [
      "first_name",
      "last_name",
      "username",
      "country",
      "timezone",
      "avatar_url",
      "banner_url",
    ];
    const fields = [];
    const values = [];
    let i = 1;

    allowed.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(data[key]);
      }
    });

    if (!fields.length) return null;

    values.push(userId);

    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${i}
      RETURNING *
      `,
      values
    );

    return rows[0];
  },

  updateBuyerProfile: async (userId, data) => {
    const allowed = [
      "client_type",
      "social_proof",
      "company_name",
      "company_website",
      "vat_id",
      "website",
      "company_description",
      "billing_country",
      "preferred_engagement_model",
      "company_size",
      "industry",
    ];

    const fields = [];
    const values = [];
    let i = 1;

    allowed.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(data[key]);
      }
    });

    if (!fields.length) return null;

    values.push(userId);

    const { rows } = await pool.query(
      `
      UPDATE buyers
      SET ${fields.join(", ")}
      WHERE id = $${i}
      RETURNING *
      `,
      values
    );

    return rows[0];
  },

  setProfileCompletion: async (userId, completion) => {
    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET profile_completion = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING profile_completion
      `,
      [userId, completion]
    );
    return rows[0]?.profile_completion;
  },

  getProfilePartsForCompletion: async (userId) => {
    const base = await ProfileModel.getBaseProfileById(userId);
    if (!base) return null;

    let buyer = null;
    let expert = null;
    let expertHasResume = false;

    if (base.role === "buyer") {
      buyer = await ProfileModel.getBuyerProfileById(userId);
    }

    if (base.role === "expert") {
      expert = await ProfileModel.getExpertProfileById(userId);
      expertHasResume = await ProfileModel.getExpertHasResume(userId);
    }

    return { base, buyer, expert, expertHasResume };
  },

  getUserReviews: async (userId, role = null) => {
    const params = [userId];
    let roleFilter = '';

    if (role === 'buyer' || role === 'expert') {
      roleFilter = ' AND f.receiver_role = $2';
      params.push(role);
    }

    const query = `
      SELECT
        f.id,
        f.rating,
        f.comment AS comment,
        f.helpful_count,
        f.created_at,
        (p.first_name || ' ' || p.last_name) AS giver_name,
        p.avatar_url AS giver_avatar,
        pr.title AS project_title
      FROM feedback f
      LEFT JOIN profiles p ON p.id = f.giver_id
      LEFT JOIN contracts c ON c.id = f.contract_id
      LEFT JOIN projects pr ON pr.id = c.project_id
      WHERE f.receiver_id = $1${roleFilter}
      ORDER BY f.created_at DESC
    `;

    const { rows } = await pool.query(query, params);
    return rows.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment || r.message || '',
      created_at: r.created_at,
      giver_name: r.giver_name || 'Anonymous',
      giver_avatar: r.giver_avatar || null,
      project_title: r.project_title || null,
      helpful_count: Number(r.helpful_count || 0),
    }));
  },

  getFullProfileById: async (userId) => {
    const base = await ProfileModel.getBaseProfileById(userId);
    if (!base) return null;

    let roleData = null;
    if (base.role === "expert") roleData = await ProfileModel.getExpertProfileById(userId);
    if (base.role === "buyer") roleData = await ProfileModel.getBuyerProfileById(userId);

    return {
      ...base,
      ...(roleData || {}),
    };
  },
};

export default ProfileModel;
