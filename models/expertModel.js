import pool from '../config/db.js';

const Expert = {
  searchExperts: async (filters) => {
    const { domain, queryText, rateMin, rateMax, onlyVerified } = filters;

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
        e.domains,
        json_build_object(
          'advisory', e.hourly_rate_advisory,
          'architectureReview', e.hourly_rate_architecture,
          'handsOnExecution', e.hourly_rate_execution
        ) as "hourlyRates",
        e.vetting_status as "vettingStatus",
        e.vetting_level as "vettingLevel",
        e.rating,
        e.review_count as "reviewCount",
        e.total_hours as "totalHours"
      FROM profiles p
      JOIN experts e ON p.id = e.id
      WHERE p.role = 'expert'
    `;

    const params = [];
    let paramIndex = 1;

    if (domain) {
      sql += ` AND e.domains @> $${paramIndex}::text[]`;
      params.push(`{${domain}}`);
      paramIndex++;
    }

    if (queryText) {
      sql += ` AND (p.first_name ILIKE $${paramIndex} OR e.experience_summary ILIKE $${paramIndex})`;
      params.push(`%${queryText}%`);
      paramIndex++;
    }

    if (onlyVerified === 'true') {
      sql += ` AND e.vetting_status = 'approved'`;
    }

    if (rateMin) {
      sql += ` AND e.hourly_rate_advisory >= $${paramIndex}`;
      params.push(rateMin);
      paramIndex++;
    }

    if (rateMax) {
      sql += ` AND e.hourly_rate_advisory <= $${paramIndex}`;
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
        e.experience_summary, -- Added explicitly to match schema
        e.experience_summary as "bio",
        e.experience_summary as "experienceSummary",
        COALESCE(e.domains, '{}') as domains,
        json_build_object(
          'advisory', COALESCE(e.hourly_rate_advisory, 0),
          'architectureReview', COALESCE(e.hourly_rate_architecture, 0),
          'handsOnExecution', COALESCE(e.hourly_rate_execution, 0)
        ) as "hourlyRates",
        COALESCE(e.vetting_status, 'pending') as "vettingStatus",
        e.vetting_level as "vettingLevel",
        COALESCE(e.rating, 0) as rating,
        COALESCE(e.review_count, 0) as "reviewCount",
        e.availability,
        COALESCE(e.patents, '{}') as patents,
        COALESCE(e.papers, '{}') as papers,
        COALESCE(e.products, '{}') as products
      FROM profiles p
      LEFT JOIN experts e ON p.id = e.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // ========== SEMANTIC SEARCH METHODS ==========

  /**
   * Get experts that need embeddings generated
   * Returns experts with no embedding or stale embeddings
   */
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

  /**
   * Update expert embedding
   * @param {string} expertId - Expert ID
   * @param {number[]} embedding - 384-dimensional vector
   * @param {string} text - The text that was embedded
   */
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
    
    // Convert array to PostgreSQL vector format
    const vectorString = `[${embedding.join(',').slice(0, 10000)}]`;
    
    const { rows } = await pool.query(sql, [
      vectorString,
      text,
      expertId
    ]);
    return rows[0];
  },

  /**
   * Get all experts with embeddings (for semantic search)
   */
  getAllWithEmbeddings: async () => {
    const sql = `
      SELECT 
        e.id,
        p.first_name || ' ' || p.last_name as name,
        e.experience_summary as bio,
        e.skills,
        e.domains,
        e.embedding,
        e.hourly_rate_advisory as hourly_rate,
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

  /**
   * Get expert with full details (including embedding)
   */
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