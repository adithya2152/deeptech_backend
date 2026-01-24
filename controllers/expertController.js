import expertModel from '../models/expertModel.js';
import { supabase } from '../config/supabase.js';
import pool from '../config/db.js';

/* =========================
   SEARCH EXPERTS
========================= */
export const searchExperts = async (req, res) => {
  try {
    const { domain, query } = req.query;
    const experts = await expertModel.searchExperts({ domain, queryText: query });
    res.json({ success: true, data: experts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/* =========================
   SEMANTIC SEARCH
========================= */
export const semanticSearch = async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    if (!query?.trim()) return res.json({ results: [], totalResults: 0 });

    const response = await callSemanticSearchService(query, limit);
    const results = (response.results || []).map(e => ({
      id: e.id,
      expert_profile_id: e.expertProfileId,
      profile_id: e.profileId,
      user_id: e.userId,
      first_name: e.firstName,
      last_name: e.lastName,
      name: e.name || '',
      avatar_url: e.avatarUrl,
      experience_summary: e.bio || '',
      domains: e.domains || [],
      skills: e.skills || [],
      avg_daily_rate: e.expertRates?.avgDailyRate || 0,
      avg_fixed_rate: e.expertRates?.avgFixedRate || 0,
      avg_sprint_rate: e.expertRates?.avgSprintRate || 0,
      expert_status: e.expertStatus,
      vetting_level: e.vettingLevel,
      rating: e.rating,
      review_count: e.reviewCount,
      total_hours: e.totalHours,
      availability_status: e.availabilityStatus,
      years_experience: e.yearsExperience,
      similarity_score: e.similarityScore,
    }));

    res.json({ results, totalResults: results.length, query });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Semantic search failed' });
  }
};

/* =========================
   GET EXPERT BY ID
========================= */
export const getExpertById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ message: 'Valid expert ID is required' });
    }

    const expert = await expertModel.getExpertById(id);
    if (!expert) return res.status(404).json({ message: 'Expert not found' });

    const expertProfileId = expert.expert_profile_id || expert.profile_id || id;
    let documents = [];

    if (expertProfileId && expertProfileId !== 'undefined') {
      const { rows } = await pool.query(
        `SELECT id, document_type, sub_type, title, url, is_public, created_at
         FROM expert_documents WHERE expert_profile_id = $1 ORDER BY created_at DESC`,
        [expertProfileId]
      );
      documents = rows;
    }

    res.json({ success: true, data: { ...expert, documents } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch expert' });
  }
};

/* =========================
   UPDATE EXPERT PROFILE (FIXED INTEGER PARSING)
========================= */
export const updateExpertProfile = async (req, res) => {
  try {
    const expertId = req.params.id;
    const userId = req.user.id;
    const profileId = req.user.profileId;

    if (req.user.role !== 'expert') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const expert = await expertModel.getExpertById(expertId);
    if (!expert) return res.status(404).json({ message: 'Expert not found' });

    if (expert.user_id !== userId && expert.expert_profile_id !== profileId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // 1. Update User Account Fields
    const profileFields = ['avatar_url', 'banner_url', 'country', 'timezone'];
    const userUpdates = [];
    const userValues = [];
    let i = 1;

    for (const field of profileFields) {
      if (req.body[field] !== undefined) {
        userUpdates.push(`${field} = $${i++}`);
        userValues.push(req.body[field]);
      }
    }

    if (userUpdates.length) {
      userValues.push(userId);
      await pool.query(
        `UPDATE user_accounts SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
        userValues
      );
    }

    // 2. Filter & Sanitize Expert Fields
    const allowedExpertFields = [
      'experience_summary', 'domains', 'headline', 'availability_status',
      'avg_hourly_rate', 'avg_daily_rate', 'avg_sprint_rate', 'avg_fixed_rate', 'years_experience',
      'preferred_engagement_mode', 'languages', 'portfolio_url', 'skills',
      'patents', 'papers', 'projects', 'products', 'certificates', 'awards',
      'profile_video_url', 'is_profile_complete', 'expert_status'
    ];

    // Fields that MUST be Integers in your DB
    const integerFields = ['years_experience', 'avg_daily_rate', 'avg_sprint_rate', 'avg_fixed_rate'];

    const expertDataToUpdate = {};
    Object.keys(req.body).forEach(key => {
      if (allowedExpertFields.includes(key)) {
        let value = req.body[key];

        // CRITICAL FIX: Round decimals to integers to prevent DB crash
        if (integerFields.includes(key) && value !== null && value !== undefined && value !== '') {
          value = Math.round(Number(value));
        }

        expertDataToUpdate[key] = value;
      }
    });

    const updatedExpert = await expertModel.updateExpertById(expert.expert_profile_id, expertDataToUpdate);

    // ✅ Trigger embedding generation asynchronously (non-blocking)
    generateEmbeddingAsync(expert.expert_profile_id).catch(err => {
      console.error('Failed to generate embedding:', err);
      // Don't fail the request if embedding generation fails
    });

    res.json({
      success: true,
      data: updatedExpert || {},
      message: 'Expert profile updated',
    });
  } catch (err) {
    console.error("Update Expert Error:", err);
    res.status(500).json({ message: 'Update failed' });
  }
};

/* =========================
   RESUME SIGNED URL
========================= */
export const getResumeSignedUrl = async (req, res) => {
  try {
    const profileId = req.user.profileId;
    const { rows } = await pool.query(
      `SELECT url FROM expert_documents
       WHERE expert_profile_id = $1 AND document_type = 'resume'
       ORDER BY created_at DESC LIMIT 1`,
      [profileId]
    );

    if (!rows.length) return res.status(404).json({ message: 'No resume uploaded' });

    const { data } = await supabase.storage
      .from('expert-private-documents')
      .createSignedUrl(rows[0].url, 300);

    res.json({ url: data.signedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate link' });
  }
};

/* =========================
   UPLOAD DOCUMENT
========================= */
export const uploadExpertDocument = async (req, res) => {
  try {
    if (req.user.role !== 'expert') return res.status(403).json({ message: 'Only experts allowed' });

    const { type, sub_type, title, url, is_public = true } = req.body;
    const file = req.file;
    const userId = req.user.id;
    const profileId = req.user.profileId;

    const allowed = ['resume', 'work', 'publication', 'credential', 'other'];
    if (!allowed.includes(type)) return res.status(400).json({ message: 'Invalid type' });

    let finalUrl = url;

    // For resumes, we enforce a single document per expert and replace it on re-upload.
    // This avoids unique constraint violations when the UI “removes” locally but hasn’t saved yet.
    let previousResumePath = null;
    if (type === 'resume') {
      const { rows: previousRows } = await pool.query(
        `SELECT url FROM expert_documents
         WHERE expert_id = $1 AND document_type = 'resume'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (previousRows.length && typeof previousRows[0].url === 'string') {
        previousResumePath = previousRows[0].url;
      }
    }

    if (file) {
      const bucket = type === 'resume' ? 'expert-private-documents' : 'expert-public-documents';
      const filePath = `experts/${userId}/${type}/${Date.now()}-${file.originalname}`;

      const { error } = await supabase.storage.from(bucket).upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

      if (error) throw error;

      finalUrl = type === 'resume'
        ? filePath
        : supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    }

    const queryConfig = type === 'resume'
      ? {
        text: `INSERT INTO expert_documents
                 (expert_id, expert_profile_id, document_type, sub_type, title, url, is_public)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (expert_id) WHERE (document_type = 'resume')
                 DO UPDATE SET
                   expert_profile_id = EXCLUDED.expert_profile_id,
                   sub_type = EXCLUDED.sub_type,
                   title = EXCLUDED.title,
                   url = EXCLUDED.url,
                   is_public = EXCLUDED.is_public,
                   created_at = NOW()
                 RETURNING *`,
        values: [userId, profileId, type, sub_type, title, finalUrl, is_public],
      }
      : {
        text: `INSERT INTO expert_documents
                 (expert_id, expert_profile_id, document_type, sub_type, title, url, is_public)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        values: [userId, profileId, type, sub_type, title, finalUrl, is_public],
      };

    const { rows } = await pool.query(queryConfig);

    // Best-effort cleanup: if we replaced a stored resume file, remove the old object.
    if (
      type === 'resume' &&
      file &&
      previousResumePath &&
      previousResumePath !== finalUrl &&
      !previousResumePath.startsWith('http')
    ) {
      try {
        await supabase.storage.from('expert-private-documents').remove([previousResumePath]);
      } catch (cleanupErr) {
        console.warn('Resume cleanup failed:', cleanupErr);
      }
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed' });
  }
};

/* =========================
   DELETE DOCUMENT
========================= */
export const deleteExpertDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const profileId = req.user.profileId;

    const { rowCount } = await pool.query(
      `DELETE FROM expert_documents WHERE id = $1 AND expert_profile_id = $2`,
      [documentId, profileId]
    );

    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delete failed' });
  }
};

/* =========================
   DASHBOARD STATS
========================= */
export const getDashboardStats = async (req, res) => {
  try {
    const expertId = req.params.id;
    const userId = req.user?.id || expertId;
    const expert = await expertModel.getExpertById(expertId);
    const expertProfileId = expert?.expert_profile_id || expertId;

    // Get user's preferred display currency
    const { rows: prefRows } = await pool.query(
      `SELECT preferred_currency FROM user_accounts WHERE id = $1`,
      [userId]
    );
    const displayCurrency = prefRows[0]?.preferred_currency || 'INR';

    // Get exchange rate for conversion (if not INR)
    let exchangeRate = 1;
    if (displayCurrency !== 'INR') {
      const { rows: rateRows } = await pool.query(
        `SELECT rate_from_inr FROM exchange_rates WHERE currency = $1`,
        [displayCurrency]
      );
      exchangeRate = parseFloat(rateRows[0]?.rate_from_inr) || 1;
    }

    // All amounts in DB are stored in INR (base currency)
    const { rows: totalRows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM invoices WHERE expert_profile_id = $1 AND status = 'paid'
    `, [expertProfileId]);

    const { rows: monthlyRows } = await pool.query(`
      SELECT TO_CHAR(date_trunc('month', created_at), 'Mon') AS name, COALESCE(SUM(amount), 0) AS value
      FROM invoices
      WHERE expert_profile_id = $1 AND status = 'paid' AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)
    `, [expertProfileId]);

    const { rows: trendRows } = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN amount ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW() - INTERVAL '1 month') 
                          AND created_at < date_trunc('month', NOW()) THEN amount ELSE 0 END), 0) AS last_month
      FROM invoices WHERE expert_profile_id = $1 AND status = 'paid'
    `, [expertProfileId]);

    const thisMonth = parseFloat(trendRows[0].this_month) || 0;
    const lastMonth = parseFloat(trendRows[0].last_month) || 0;
    let trendPercentage = 0;
    if (lastMonth > 0) trendPercentage = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    else if (thisMonth > 0) trendPercentage = 100;

    // Convert all amounts to display currency
    const totalEarningsINR = parseFloat(totalRows[0].total) || 0;
    const totalEarnings = Math.round(totalEarningsINR * exchangeRate);

    res.json({
      success: true,
      data: {
        totalEarnings,
        totalEarningsINR, // Keep original INR for reference
        displayCurrency,
        earningsChart: monthlyRows.map(r => ({
          name: r.name,
          value: Math.round((parseFloat(r.value) || 0) * exchangeRate)
        })),
        trendPercentage
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
};

/* =========================
   SEMANTIC SERVICE
========================= */
async function callSemanticSearchService(query, limit) {
  const res = await fetch(
    `${process.env.PYTHON_SEMANTIC_SEARCH_URL}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    }
  );
  return res.json();
}

/**
 * Generate embedding for expert asynchronously
 * Called after profile updates to keep semantic search current
 */
async function generateEmbeddingAsync(expertProfileId) {
  try {
    console.log(`🔄 Generating embedding for expert: ${expertProfileId}`);

    const response = await fetch(
      `${process.env.PYTHON_SEMANTIC_SEARCH_URL}/experts/${expertProfileId}/embedding`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Embedding generation failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Embedding generated for expert: ${expertProfileId}`);
    return result;
  } catch (error) {
    console.error(`❌ Embedding generation error for ${expertProfileId}:`, error.message);
    throw error;
  }
}

/* =========================
   GET RECOMMENDED PROJECTS
========================= */
export const getRecommendedProjects = async (req, res) => {
  try {
    const expertId = req.params.id;
    const { limit = 6 } = req.query;

    // 1. Get Expert Data to find the expert_profile_id
    const expert = await expertModel.getExpertById(expertId);
    if (!expert) {
      return res.status(404).json({ message: 'Expert not found' });
    }

    // Ensure we have the UUID profile ID
    const expertProfileId = expert.expert_profile_id;

    // 2. Call the Python Microservice
    // Note: The Python endpoint is GET /projects/recommended?expert_profile_id=...
    const pythonUrl = new URL(`${process.env.PYTHON_SEMANTIC_SEARCH_URL}/projects/recommended`);
    pythonUrl.searchParams.append('expert_profile_id', expertProfileId);
    pythonUrl.searchParams.append('limit', limit);

    const response = await fetch(pythonUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(`Python service error: ${response.status}`);
      // Return empty results rather than crashing if the AI service is down
      return res.json({ success: true, data: { results: [], totalResults: 0 } });
    }

    const result = await response.json();

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Project Recommendation Error:", err);
    res.status(500).json({ message: 'Failed to fetch recommendations' });
  }
};

export default {
  searchExperts,
  semanticSearch,
  getExpertById,
  updateExpertProfile,
  getResumeSignedUrl,
  uploadExpertDocument,
  deleteExpertDocument,
  getDashboardStats,
  getRecommendedProjects
};