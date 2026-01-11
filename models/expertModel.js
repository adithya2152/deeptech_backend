import pool from '../config/db.js';

const Expert = {
  searchExperts: async ({ domain, queryText }) => {
    let sql = `
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.first_name || ' ' || p.last_name AS name,
        p.avatar_url,
        p.banner_url,

        e.experience_summary,
        e.domains,
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
        e.is_profile_complete
      FROM profiles p
      JOIN experts e ON p.id = e.id
      WHERE p.role = 'expert'
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
        p.first_name ILIKE $${i}
        OR p.last_name ILIKE $${i}
        OR e.experience_summary ILIKE $${i}
      )`;
      params.push(`%${queryText}%`);
      i++;
    }

    const { rows } = await pool.query(sql, params);
    return rows;
  },

  getExpertById: async (id) => {
    const { rows } = await pool.query(
      `
      SELECT
        e.id,
        p.first_name,
        p.last_name,
        p.email,
        p.avatar_url,
        p.banner_url,
        p.timezone,
        p.country,
        p.created_at,
        p.updated_at,
        e.experience_summary,
        e.domains,
        e.availability_status,
        e.is_profile_complete,
        e.expert_status,
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
        e.skills
      FROM experts e
      JOIN profiles p ON e.id = p.id
      WHERE e.id = $1
      `,
      [id]
    );

    return rows[0];
  },

  updateExpertById: async (id, data) => {
    const allowed = [
      'experience_summary',
      'domains',
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

    values.push(id);

    const { rows } = await pool.query(
      `
      UPDATE experts
      SET ${fields.join(', ')},
          updated_at = NOW(),
          profile_updated_at = NOW()
      WHERE id = $${i}
      RETURNING *
      `,
      values
    );

    return rows[0];
  }
};

export default Expert;
