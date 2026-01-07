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
        p.avatar_url,
        p.banner_url,
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
      p.avatar_url,
      p.banner_url,

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
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Define allowed columns to prevent SQL injection or invalid column errors
    const allowedColumns = [
      'experience_summary',
      'domains',
      'avg_daily_rate',
      'avg_sprint_rate',
      'avg_fixed_rate',
      'preferred_engagement_mode',
      'years_experience',
      'languages',
      'portfolio_url',
      'profile_video_url',
      'skills',
      'is_profile_complete',
      'expert_status',
      'availability_status',
      'timezone'
    ];

    // Iterate over allowed columns and check if they exist in the input data
    allowedColumns.forEach(col => {
      if (Object.prototype.hasOwnProperty.call(data, col)) {
        fields.push(`${col} = $${paramIndex}`);
        values.push(data[col]);
        paramIndex++;
      }
    });

    // Always update timestamps
    fields.push(`updated_at = NOW()`);
    fields.push(`profile_updated_at = NOW()`);

    // If no fields to update, return early to avoid SQL error
    if (values.length === 0) {
      return null;
    }

    const sql = `
      UPDATE experts
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    values.push(id);

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