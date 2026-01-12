import pool from "../config/db.js";

const ProfileModel = {
  // Get active profile for a user
  getActiveProfile: async (userId) => {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active FROM profiles 
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  // Get all profiles for a user
  getAllProfiles: async (userId) => {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active, created_at FROM profiles WHERE user_id = $1`,
      [userId]
    );
    return rows;
  },

  ensureBuyerRow: async (userId, buyerProfileId) => {
    await pool.query(
      `INSERT INTO buyers (id, buyer_profile_id) VALUES ($1, $2)
       ON CONFLICT (buyer_profile_id) DO NOTHING`,
      [userId, buyerProfileId]
    );
  },

  // Get base user data from user_accounts
  getBaseProfileById: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT
        id, email, first_name, last_name, username, role,
        avatar_url, banner_url, timezone, profile_completion, 
        created_at, updated_at, last_login, email_verified, country
      FROM user_accounts
      WHERE id = $1
      `,
      [userId]
    );
    return rows[0];
  },

  // Get expert profile data by joining via expert_profile_id
  getExpertProfileById: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT
        e.expert_profile_id,
        e.domains,
        e.experience_summary,
        e.skills,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.preferred_engagement_mode,
        e.languages,
        e.years_experience,
        e.availability_status,
        e.portfolio_url,
        e.profile_video_url,
        e.linkedin_url,
        e.github_url,
        e.rating,
        e.review_count,
        e.total_hours,
        e.expert_status,
        e.is_profile_complete,
        e.is_active
      FROM experts e
      JOIN profiles p ON e.expert_profile_id = p.id
      WHERE p.user_id = $1 AND p.profile_type = 'expert'
      `,
      [userId]
    );
    return rows[0];
  },

  // Get expert profile by profile ID directly
  getExpertByProfileId: async (profileId) => {
    const { rows } = await pool.query(
      `
      SELECT
        e.*,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        u.banner_url,
        u.timezone,
        u.country
      FROM experts e
      JOIN profiles p ON e.expert_profile_id = p.id
      JOIN user_accounts u ON p.user_id = u.id
      WHERE e.expert_profile_id = $1
      `,
      [profileId]
    );
    return rows[0];
  },

  getExpertHasResume: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT 1
      FROM expert_documents ed
      JOIN profiles p ON ed.expert_profile_id = p.id
      WHERE p.user_id = $1 AND ed.document_type = 'resume'
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
        b.buyer_profile_id,
        b.company_name,
        b.company_description,
        b.company_size,
        b.industry,
        b.website,
        b.billing_country,
        b.client_type,
        b.social_proof,
        b.company_website,
        b.vat_id,
        b.total_spent,
        b.projects_posted,
        b.hires_made,
        b.avg_contract_value,
        b.preferred_engagement_model,
        b.verified,
        b.is_active
      FROM buyers b
      JOIN profiles p ON b.buyer_profile_id = p.id
      WHERE p.user_id = $1 AND p.profile_type = 'buyer'
      `,
      [userId]
    );
    return rows[0];
  },

  // Get buyer by profile ID directly
  getBuyerByProfileId: async (profileId) => {
    const { rows } = await pool.query(
      `
      SELECT
        b.*,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        u.banner_url,
        u.timezone,
        u.country
      FROM buyers b
      JOIN profiles p ON b.buyer_profile_id = p.id
      JOIN user_accounts u ON p.user_id = u.id
      WHERE b.buyer_profile_id = $1
      `,
      [profileId]
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
      UPDATE user_accounts
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

    // Update via buyer_profile_id join
    const { rows } = await pool.query(
      `
      UPDATE buyers b
      SET ${fields.join(", ")}
      FROM profiles p
      WHERE b.buyer_profile_id = p.id 
        AND p.user_id = $${i}
        AND p.profile_type = 'buyer'
      RETURNING b.*
      `,
      [...values, userId]
    );

    return rows[0];
  },

  setProfileCompletion: async (userId, completion) => {
    const { rows } = await pool.query(
      `
      UPDATE user_accounts
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

    // Get active profile to determine role
    const activeProfile = await ProfileModel.getActiveProfile(userId);
    const role = activeProfile?.profile_type || base.role;

    let buyer = null;
    let expert = null;
    let expertHasResume = false;

    if (role === "buyer") {
      buyer = await ProfileModel.getBuyerProfileById(userId);
    }

    if (role === "expert") {
      expert = await ProfileModel.getExpertProfileById(userId);
      expertHasResume = await ProfileModel.getExpertHasResume(userId);
    }

    return { base: { ...base, role }, buyer, expert, expertHasResume };
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
        (u.first_name || ' ' || u.last_name) AS giver_name,
        u.avatar_url AS giver_avatar,
        pr.title AS project_title
      FROM feedback f
      LEFT JOIN user_accounts u ON u.id = f.giver_id
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

    const activeProfile = await ProfileModel.getActiveProfile(userId);
    const role = activeProfile?.profile_type || base.role;

    let roleData = null;
    if (role === "expert") roleData = await ProfileModel.getExpertProfileById(userId);
    if (role === "buyer") roleData = await ProfileModel.getBuyerProfileById(userId);

    return {
      ...base,
      role,
      profileId: activeProfile?.id || null,
      ...(roleData || {}),
    };
  },
};

export default ProfileModel;
