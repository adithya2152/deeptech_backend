import pool from '../config/db.js';

const Expert = {
  searchExperts: async ({ domain, queryText }) => {
    let sql = `
      SELECT 
        e.expert_profile_id,
        p.id as profile_id,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.first_name || ' ' || u.last_name AS name,
        u.avatar_url,
        u.banner_url,

        e.experience_summary,
        e.domains,
        e.avg_hourly_rate,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.preferred_engagement_mode,
        e.languages,
        e.years_experience,
        e.portfolio_url,
        e.rating,
        e.review_count,
        e.total_hours,
        e.skills,
        e.expert_status,
        e.is_profile_complete,
        
        -- Tier Info
        (
          SELECT json_build_object(
            'tier_name', rt.tier_name,
            'tier_level', rt.tier_level,
            'badge_icon', rt.badge_icon
          )
          FROM user_rank_tiers rt
          WHERE rt.user_id = u.id
        ) as tier,

        -- Badges Info (Top 3 for card view)
        (
           SELECT json_agg(t_row)
           FROM (
             SELECT id, tag_name, tag_icon, description
             FROM user_tags t
             WHERE t.user_id = u.id
             ORDER BY t.display_priority ASC, t.awarded_at DESC
             LIMIT 3
           ) t_row
        ) as badges

      FROM experts e
      JOIN profiles p ON e.expert_profile_id = p.id
      JOIN user_accounts u ON p.user_id = u.id
      WHERE p.profile_type = 'expert'
    `;

    const params = [];
    let i = 1;

    if (domain) {
      sql += ` AND e.domains && $${i}::text[]`;
      params.push(domain.split(','));
      i++;
    }

    if (queryText) {
      sql += ` AND (
        u.first_name ILIKE $${i}
        OR u.last_name ILIKE $${i}
        OR e.experience_summary ILIKE $${i}
      )`;
      params.push(`%${queryText}%`);
      i++;
    }

    const { rows } = await pool.query(sql, params);
    return rows;
  },

  getExpertById: async (id) => {
    // First try to find by expert_profile_id
    let { rows } = await pool.query(
      `
      SELECT
        e.expert_profile_id,
        p.id as profile_id,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        u.banner_url,
        u.timezone,
        u.country,
        u.created_at,
        u.updated_at,
        e.experience_summary,
        e.domains,
        e.availability_status,
        e.is_profile_complete,
        e.expert_status,
        e.avg_hourly_rate,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.preferred_engagement_mode,
        e.languages,
        e.years_experience,
        e.portfolio_url,
        e.profile_video_url,
        e.rating,
        e.review_count,
        e.review_count,
        e.skills,

        -- Tier Info
        (
          SELECT json_build_object(
            'tier_name', rt.tier_name,
            'tier_level', rt.tier_level,
            'badge_icon', rt.badge_icon
          )
          FROM user_rank_tiers rt
          WHERE rt.user_id = u.id
        ) as tier,

        -- Badges Info (All badges for profile view)
        (
           SELECT json_agg(t_row)
           FROM (
             SELECT id, tag_name, tag_icon, description
             FROM user_tags t
             WHERE t.user_id = u.id
             ORDER BY t.display_priority ASC, t.awarded_at DESC
           ) t_row
        ) as badges

      FROM experts e
      JOIN profiles p ON e.expert_profile_id = p.id
      JOIN user_accounts u ON p.user_id = u.id
      WHERE e.expert_profile_id = $1
      `,
      [id]
    );

    // If not found, try by user_id (legacy support)
    if (rows.length === 0) {
      const result = await pool.query(
        `
        SELECT
          e.expert_profile_id,
          p.id as profile_id,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.avatar_url,
          u.banner_url,
          u.timezone,
          u.country,
          u.created_at,
          u.updated_at,
          e.experience_summary,
          e.domains,
          e.availability_status,
          e.is_profile_complete,
          e.expert_status,
          e.avg_hourly_rate,
          e.avg_daily_rate,
          e.avg_fixed_rate,
          e.avg_sprint_rate,
          e.preferred_engagement_mode,
          e.languages,
          e.years_experience,
          e.portfolio_url,
          e.profile_video_url,
          e.rating,
          e.review_count,
          e.review_count,
          e.skills,

        -- Tier Info
        (
          SELECT json_build_object(
            'tier_name', rt.tier_name,
            'tier_level', rt.tier_level,
            'badge_icon', rt.badge_icon
          )
          FROM user_rank_tiers rt
          WHERE rt.user_id = u.id
        ) as tier,

        -- Badges Info
        (
           SELECT json_agg(t_row)
           FROM (
             SELECT id, tag_name, tag_icon, description
             FROM user_tags t
             WHERE t.user_id = u.id
             ORDER BY t.display_priority ASC, t.awarded_at DESC
           ) t_row
        ) as badges

        FROM experts e
        JOIN profiles p ON e.expert_profile_id = p.id
        JOIN user_accounts u ON p.user_id = u.id
        WHERE u.id = $1
        `,
        [id]
      );
      rows = result.rows;
    }

    return rows[0];
  },

  updateExpertById: async (id, data) => {
    const allowed = [
      'experience_summary',
      'domains',
      'avg_hourly_rate',
      'avg_daily_rate',
      'avg_fixed_rate',
      'avg_sprint_rate',
      'preferred_engagement_mode',
      'years_experience',
      'languages',
      'portfolio_url',
      'profile_video_url',
      'skills',
      'expert_status',
      'availability_status',
      'is_profile_complete'
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

    // Try to update by expert_profile_id first
    values.push(id);

    let { rows } = await pool.query(
      `
      UPDATE experts
      SET ${fields.join(', ')},
          updated_at = NOW(),
          profile_updated_at = NOW()
      WHERE expert_profile_id = $${i}
      RETURNING *
      `,
      values
    );

    // If no rows updated, try by user_id (legacy)
    if (rows.length === 0) {
      values[values.length - 1] = id;
      const result = await pool.query(
        `
        UPDATE experts e
        SET ${fields.join(', ')},
            updated_at = NOW(),
            profile_updated_at = NOW()
        FROM profiles p
        WHERE e.expert_profile_id = p.id
          AND p.user_id = $${i}
        RETURNING e.*
        `,
        values
      );
      rows = result.rows;
    }

    return rows[0];
  },

  // Get expert by user ID
  getExpertByUserId: async (userId) => {
    const { rows } = await pool.query(
      `
      SELECT e.*, p.id as profile_id
      FROM experts e
      JOIN profiles p ON e.expert_profile_id = p.id
      WHERE p.user_id = $1 AND p.profile_type = 'expert'
      `,
      [userId]
    );
    return rows[0];
  }
};

export default Expert;
