import expertModel from '../models/expertModel.js';
import { supabase } from '../config/supabase.js';
import pool from '../config/db.js';

/* =========================
   SEARCH EXPERTS
========================= */
export const searchExperts = async (req, res) => {
  try {
    const { domain, query } = req.query;

    const experts = await expertModel.searchExperts({
      domain,
      queryText: query,
    });

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

    if (!query?.trim()) {
      return res.json({ results: [], totalResults: 0 });
    }

    const response = await callSemanticSearchService(query, limit);

    const results = (response.results || []).map(e => ({
      id: e.id,
      name: e.name || '',
      experience_summary: e.bio || '',
      domains: e.domains || [],
      skills: e.skills || [],
      rating: e.rating,
      review_count: e.review_count,
      total_hours: e.total_hours,
      availability_status: e.availability,
    }));

    res.json({
      results,
      totalResults: results.length,
      query,
    });
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

    const expert = await expertModel.getExpertById(id);
    if (!expert) {
      return res.status(404).json({ message: 'Expert not found' });
    }

    const { rows: documents } = await pool.query(
      `
      SELECT id, document_type, sub_type, title, url, is_public, created_at
      FROM expert_documents
      WHERE expert_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    res.json({ success: true, data: { ...expert, documents } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch expert' });
  }
};

/* =========================
   UPDATE EXPERT PROFILE
========================= */
export const updateExpertProfile = async (req, res) => {
  try {
    const expertId = req.params.id;

    if (req.user.id !== expertId || req.user.role !== 'expert') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    /* profiles table */
    const profileFields = ['avatar_url', 'banner_url', 'country', 'timezone'];
    const updates = [];
    const values = [];
    let i = 1;

    for (const field of profileFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${i++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length) {
      values.push(expertId);
      await pool.query(
        `UPDATE profiles SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
        values
      );
    }

    /* experts table */
    const updatedExpert = await expertModel.updateExpertById(expertId, req.body);

    res.json({
      success: true,
      data: updatedExpert || {},
      message: 'Expert profile updated',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
  }
};

/* =========================
   RESUME SIGNED URL
========================= */
export const getResumeSignedUrl = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT url FROM expert_documents
      WHERE expert_id = $1 AND document_type = 'resume'
      ORDER BY created_at DESC LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No resume uploaded' });
    }

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
    if (req.user.role !== 'expert') {
      return res.status(403).json({ message: 'Only experts allowed' });
    }

    const { type, sub_type, title, url, is_public = true } = req.body;
    const file = req.file;
    const userId = req.user.id;

    const allowed = ['resume', 'work', 'publication', 'credential', 'other'];
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: 'Invalid type' });
    }

    let finalUrl = url;

    if (file) {
      const bucket =
        type === 'resume'
          ? 'expert-private-documents'
          : 'expert-public-documents';

      const filePath = `experts/${userId}/${type}/${Date.now()}-${file.originalname}`;

      await supabase.storage.from(bucket).upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

      finalUrl =
        type === 'resume'
          ? filePath
          : supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    }

    const { rows } = await pool.query(
      `
      INSERT INTO expert_documents
      (expert_id, document_type, sub_type, title, url, is_public)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [userId, type, sub_type, title, finalUrl, is_public]
    );

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
    const userId = req.user.id;

    const { rowCount } = await pool.query(
      `DELETE FROM expert_documents WHERE id = $1 AND expert_id = $2`,
      [documentId, userId]
    );

    if (!rowCount) {
      return res.status(404).json({ message: 'Not found' });
    }

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

    // Get total earnings from released_total
    const { rows: totalRows } = await pool.query(`
      SELECT COALESCE(SUM(released_total), 0) AS total
      FROM contracts
      WHERE expert_id = $1
    `, [expertId]);

    // Get monthly earnings for chart (last 6 months)
    const { rows: monthlyRows } = await pool.query(`
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'Mon') AS name,
        COALESCE(SUM(released_total), 0) AS value
      FROM contracts
      WHERE expert_id = $1
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at)
    `, [expertId]);

    // Calculate trend: compare this month vs last month earnings
    const { rows: trendRows } = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN released_total ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW() - INTERVAL '1 month') 
                          AND created_at < date_trunc('month', NOW()) THEN released_total ELSE 0 END), 0) AS last_month
      FROM contracts
      WHERE expert_id = $1
    `, [expertId]);

    const thisMonth = parseFloat(trendRows[0].this_month) || 0;
    const lastMonth = parseFloat(trendRows[0].last_month) || 0;
    let trendPercentage = 0;
    if (lastMonth > 0) {
      trendPercentage = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    } else if (thisMonth > 0) {
      trendPercentage = 100; // If no last month data but has this month, show +100%
    }

    res.json({
      success: true,
      data: {
        totalEarnings: parseFloat(totalRows[0].total) || 0,
        earningsChart: monthlyRows.map(row => ({
          name: row.name,
          value: parseFloat(row.value) || 0
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

export default {
  searchExperts,
  semanticSearch,
  getExpertById,
  updateExpertProfile,
  getResumeSignedUrl,
  uploadExpertDocument,
  deleteExpertDocument,
  getDashboardStats,
};
