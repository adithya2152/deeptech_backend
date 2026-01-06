import pool from '../config/db.js';

const Expert = {
  searchExperts: async (filters) => {
    const { domain, queryText } = filters;

    let sql = `
      SELECT 
        p.id, 
        p.first_name,
        p.last_name,
        p.first_name || ' ' || p.last_name as name,
        p.email,
        e.experience_summary,
        e.experience_summary as "bio",
        e.experience_summary as "experienceSummary",
        e.is_profile_complete,
        e.expert_status,
        e.domains,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.preferred_engagement_mode, 
        e.languages,
        e.years_experience,
        e.portfolio_url,
        e.rating,
        e.review_count as "reviewCount",
        e.total_hours as "totalHours",
        e.skills,
        e.expertise_areas
      FROM profiles p
      JOIN experts e ON p.id = e.id
      WHERE p.role = 'expert'
    `;

    const params = [];
    let paramIndex = 1;

    if (domain) {
      const domains = domain.split(',');
      sql += ` AND e.domains && $${paramIndex}::text[]`;
      params.push(domains);
      paramIndex++;
    }

    if (queryText) {
      sql += ` AND (p.first_name ILIKE $${paramIndex} OR e.experience_summary ILIKE $${paramIndex})`;
      params.push(`%${queryText}%`);
      paramIndex++;
    }

    const { rows } = await pool.query(sql, params);
    return rows;
  },

  getExpertById: async (id) => {
    const query = `
    SELECT 
      p.id,
      p.first_name,
      p.last_name,
      p.first_name || ' ' || p.last_name as name,
      p.email,
      p.role,

      e.experience_summary,
      e.experience_summary as bio,
      e.domains,
      e.availability_status,
      e.timezone,
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
      e.skills,
      e.expertise_areas,

      COALESCE(
        json_agg(
          json_build_object(
            'id', d.id,
            'type', d.document_type,
            'sub_type', d.sub_type,
            'title', d.title,
            'url', d.url,
            'is_public', d.is_public
          )
        ) FILTER (WHERE d.id IS NOT NULL),
        '[]'
      ) as documents

    FROM profiles p
    JOIN experts e ON p.id = e.id
    LEFT JOIN expert_documents d ON d.expert_id = e.id
    WHERE p.id = $1
    GROUP BY p.id, e.id
  `;

    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  updateExpertById: async (id, data) => {
    const sql = `
    UPDATE experts
    SET
      experience_summary = $1,
      domains = $2,
      avg_daily_rate = $3,
      avg_sprint_rate = $4,
      avg_fixed_rate = $5,
      preferred_engagement_mode = $6,
      years_experience = $7,
      languages = $8,
      portfolio_url = $9,
      profile_video_url = $10,
      skills = $11,
      is_profile_complete = $12,
      expert_status = $13,
      availability_status = $14,
      timezone = $15,
      updated_at = NOW(),
      profile_updated_at = NOW()
    WHERE id = $16
    RETURNING *
  `;

    const values = [
      data.experience_summary ?? null,
      data.domains ?? [],
      data.avg_daily_rate ?? 0,
      data.avg_sprint_rate ?? 0,
      data.avg_fixed_rate ?? 0,
      data.preferred_engagement_mode ?? 'daily',
      data.years_experience ?? 0,
      data.languages ?? [],
      data.portfolio_url ?? null,
      data.profile_video_url ?? null,
      data.skills ?? [],
      data.is_profile_complete ?? false,
      data.expert_status ?? 'incomplete',
      data.availability_status ?? 'open',
      data.timezone ?? null,
      id
    ];

    const { rows } = await pool.query(sql, values);
    return rows[0];
  },

  // ========== SEMANTIC SEARCH METHODS ==========

  getExpertsNeedingEmbedding: async () => {
    const sql = `
      SELECT 
        e.id,
        p.first_name || ' ' || p.last_name as name,
        e.experience_summary as bio,
        e.skills,
        e.domains,
        e.expertise_areas,
        e.embedding_updated_at,
        e.updated_at
      FROM experts e
      JOIN profiles p ON e.id = p.id
      WHERE e.embedding IS NULL 
         OR e.embedding_updated_at IS NULL
         OR e.embedding_updated_at < e.updated_at
      ORDER BY e.created_at ASC
    `;
    const { rows } = await pool.query(sql);
    return rows;
  },

  updateEmbedding: async (expertId, embedding, text) => {
    const sql = `
      UPDATE experts 
      SET 
        embedding = $1::vector,
        embedding_text = $2,
        embedding_updated_at = NOW()
      WHERE id = $3
      RETURNING id, embedding_updated_at
    `;

    const vectorString = `[${embedding.join(',').slice(0, 10000)}]`;

    const { rows } = await pool.query(sql, [
      vectorString,
      text,
      expertId
    ]);
    return rows[0];
  },

  getAllWithEmbeddings: async () => {
    const sql = `
      SELECT 
        e.id,
        p.first_name || ' ' || p.last_name as name,
        e.experience_summary as bio,
        e.skills,
        e.domains,
        e.embedding,
        e.avg_daily_rate,
        e.preferred_engagement_mode,
        e.availability_status as availability,
        e.rating,
        e.total_hours
      FROM experts e
      JOIN profiles p ON e.id = p.id
      WHERE e.embedding IS NOT NULL
        AND p.role = 'expert'
    `;
    const { rows } = await pool.query(sql);
    return rows;
  },

  getById: async (id) => {
    const sql = `
      SELECT 
        e.*,
        p.first_name,
        p.last_name,
        p.email,
        p.role
      FROM experts e
      JOIN profiles p ON e.id = p.id
      WHERE e.id = $1
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  }
};

export default Expert;