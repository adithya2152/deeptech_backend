import pool from '../config/db.js';

const Expert = {
  searchExperts: async (filters) => {
    const { domain, queryText, rateMin, rateMax, onlyVerified = true } = filters;

    let sql = `
      SELECT 
        p.id, 
        p.first_name,
        p.last_name,
        p.first_name || ' ' || p.last_name as name,
        p.email,
        p.avatar_url,
        e.experience_summary,
        e.experience_summary as "bio",
        e.domains,
        e.vetting_status as "vettingStatus",
        e.vetting_level as "vettingLevel",
        e.expert_status,
        e.is_profile_complete,
        e.rating,
        e.review_count as "reviewCount",
        e.total_hours as "totalHours",
        e.skills,
        e.expertise_areas,
        e.years_experience,
        e.languages,
        e.preferred_engagement_mode,
        e.profile_video_url,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.response_time_hours
      FROM profiles p
      JOIN experts e ON p.id = e.id
      WHERE p.role = 'expert'
    `;

    const params = [];
    let paramIndex = 1;

    if (onlyVerified === 'true' || onlyVerified === true) {
      sql += ` AND e.expert_status = 'verified'`;
    }

    if (domain) {
      sql += ` AND e.domains @> $${paramIndex}::text[]`;
      params.push(`{${domain}}`);
      paramIndex++;
    }

    if (queryText) {
      sql += ` AND (p.first_name ILIKE $${paramIndex} OR e.experience_summary ILIKE $${paramIndex} OR array_to_string(e.skills, ',') ILIKE $${paramIndex})`;
      params.push(`%${queryText}%`);
      paramIndex++;
    }

    if (rateMin) {
      sql += ` AND e.avg_daily_rate >= $${paramIndex}`;
      params.push(rateMin);
      paramIndex++;
    }

    if (rateMax) {
      sql += ` AND e.avg_daily_rate <= $${paramIndex}`;
      params.push(rateMax);
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
        e.experience_summary,
        e.experience_summary as "bio",
        COALESCE(e.domains, '{}') as domains,
        COALESCE(e.vetting_status, 'pending') as "vettingStatus",
        e.vetting_level as "vettingLevel",
        e.expert_status,
        e.is_profile_complete,
        COALESCE(e.rating, 0) as rating,
        COALESCE(e.review_count, 0) as "reviewCount",
        e.availability,
        COALESCE(e.patents, '{}') as patents,
        COALESCE(e.papers, '{}') as papers,
        COALESCE(e.products, '{}') as products,
        COALESCE(e.skills, '{}') as skills,
        COALESCE(e.expertise_areas, '{}') as expertise_areas,
        e.years_experience,
        e.languages,
        e.profile_video_url,
        e.preferred_engagement_mode,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        e.response_time_hours,
        e.admin_notes,
        e.profile_reviewed_at,
        e.profile_updated_at
      FROM profiles p
      LEFT JOIN experts e ON p.id = e.id
      WHERE p.id = $1
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
        profile_video_url = $9,
        skills = $10,
        is_profile_complete = $11,
        expert_status = $12,
        updated_at = NOW(),
        profile_updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;

    const values = [
      data.experience_summary ?? null,
      data.domains ?? [],
      data.avg_daily_rate ?? null,
      data.avg_sprint_rate ?? null,
      data.avg_fixed_rate ?? null,
      data.preferred_engagement_mode ?? null,
      data.years_experience ?? null,
      data.languages ?? [],
      data.profile_video_url ?? null,
      data.skills ?? [],
      data.is_profile_complete ?? false,
      data.expert_status ?? 'incomplete',
      id
    ];

    const { rows } = await pool.query(sql, values);
    return rows[0];
  },

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
        e.availability,
        e.vetting_status,
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
        p.role,
        p.avatar_url
      FROM experts e
      JOIN profiles p ON e.id = p.id
      WHERE e.id = $1
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  }
};

export default Expert;