import expertModel from '../models/expertModel.js';
import { supabase } from '../config/supabase.js';
import pool from '../config/db.js';
import path from 'path';

export const searchExperts = async (req, res) => {
  try {
    const { domain, query, rateMin, rateMax, onlyVerified } = req.query;

    const filters = {
      domain,
      queryText: query,
      rateMin: rateMin && !isNaN(rateMin) ? rateMin : null,
      rateMax: rateMax && !isNaN(rateMax) ? rateMax : null,
      onlyVerified
    };

    const experts = await expertModel.searchExperts(filters);
    res.status(200).json({ data: experts });
  } catch (error) {
    console.error("SEARCH ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const semanticSearch = async (req, res) => {
  try {
    if (!req.body || !req.body.query) {
      return res.status(200).json({
        results: [],
        query: "",
        totalResults: 0
      });
    }

    const { query, limit = 10 } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query is required and must be a non-empty string'
      });
    }

    const searchResults = await callSemanticSearchService(query, limit);

    const resultsArray = Array.isArray(searchResults?.results)
      ? searchResults.results
      : [];

    const transformedResults = resultsArray.map(expert => ({
      id: expert.id,
      name: expert.name,
      email: expert.email,
      bio: expert.bio,
      experience_summary: expert.bio,

      domains: expert.domains || [],
      skills: expert.skills || [],

      rating: expert.rating,
      review_count: expert.review_count,
      total_hours: expert.total_hours,
      availability: expert.availability,
    }));


    res.status(200).json({
      results: transformedResults,
      query: query,
      totalResults: transformedResults.length
    });

  } catch (error) {
    console.error("SEMANTIC SEARCH ERROR:", error);
    res.status(500).json({
      error: 'Semantic search service unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getExpertById = async (req, res) => {
  try {
    const { id } = req.params;

    const expert = await expertModel.getExpertById(id);
    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    const { rows: documents } = await pool.query(
      `
      SELECT id, expert_id, document_type, sub_type, title, url, is_public, created_at
      FROM expert_documents
      WHERE expert_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    res.status(200).json({ data: { ...expert, documents } });
  } catch (error) {
    console.error("GET ID ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateExpertProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Dynamic update for profile images (avatar/banner)
    const mediaUpdates = [];
    const mediaValues = [];
    let queryIndex = 1;

    // Use hasOwnProperty to strictly check if the key was sent in the request.
    // If sent (even as null), we update it. If not sent (undefined), we ignore it.
    if (req.body.avatar_url !== undefined) {
      mediaUpdates.push(`avatar_url = $${queryIndex++}`);
      mediaValues.push(req.body.avatar_url);
    }

    if (req.body.banner_url !== undefined) {
      mediaUpdates.push(`banner_url = $${queryIndex++}`);
      mediaValues.push(req.body.banner_url);
    }

    if (mediaUpdates.length > 0) {
      mediaValues.push(id);
      await pool.query(
        `UPDATE profiles SET ${mediaUpdates.join(', ')} WHERE id = $${queryIndex}`,
        mediaValues
      );
    }

    // Update other expert fields
    const updatedExpert = await expertModel.updateExpertById(id, req.body);
    
    // Return success even if expertModel returns null (e.g. if no expert-specific fields were updated)
    res.status(200).json({
      success: true,
      data: updatedExpert || { id },
      message: 'Profile updated'
    });
  } catch (error) {
    console.error('UPDATE EXPERT ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expert profile',
    });
  }
};

export const getResumeSignedUrl = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT url
      FROM expert_documents
      WHERE expert_id = $1 AND document_type = 'resume'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const resumePath = rows[0]?.url;

    if (!resumePath) {
      return res.status(404).json({ message: 'No resume uploaded' });
    }

    const { data, error } = await supabase.storage
      .from('expert-private-documents')
      .createSignedUrl(resumePath, 60 * 5); // 5 min

    if (error) throw error;

    res.json({ url: data.signedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate resume link' });
  }
};

export const uploadExpertDocument = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { type, sub_type, title, url, is_public = true } = req.body;
    const file = req.file;

    const allowedTypes = ['resume', 'work', 'publication', 'credential', 'other'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    let finalUrl = null;

    if (['resume', 'publication', 'credential'].includes(type)) {
      if (!file) return res.status(400).json({ message: 'File required' });

      const bucket =
        type === 'resume' ? 'expert-private-documents' : 'expert-public-documents';

      const filePath = `experts/${userId}/${type}/${Date.now()}-${file.originalname}`;

      const { error } = await supabase.storage.from(bucket).upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

      if (error) return res.status(500).json({ message: error.message });

      finalUrl =
        type === 'resume'
          ? filePath
          : supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    }

    if (['work', 'other'].includes(type)) {
      if (!url) return res.status(400).json({ message: 'URL required' });
      finalUrl = url;
    }

    const insertRes = await pool.query(
      `
      INSERT INTO expert_documents
      (expert_id, document_type, sub_type, title, url, is_public)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [userId, type, sub_type || null, title || null, finalUrl, is_public]
    );

    const insertedDoc = insertRes.rows[0];

    if (type === 'resume') {
      await pool.query(
        `
        DELETE FROM expert_documents
        WHERE expert_id = $1
          AND document_type = 'resume'
          AND id <> $2
        `,
        [userId, insertedDoc.id]
      );
    }

    res.json({ success: true, data: insertedDoc });
  } catch (error) {
    console.error('UPLOAD DOCUMENT ERROR:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

export const deleteExpertDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { documentId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT * FROM expert_documents
      WHERE id = $1 AND expert_id = $2
      `,
      [documentId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = rows[0];

    if (['resume', 'publication', 'credential'].includes(doc.document_type)) {
      const bucket =
        doc.document_type === 'resume'
          ? 'expert-private-documents'
          : 'expert-public-documents';

      const filePath =
        doc.document_type === 'resume'
          ? doc.url
          : doc.url.split(`${bucket}/`)[1];

      if (filePath) {
        await supabase.storage.from(bucket).remove([filePath]);
      }
    }

    await pool.query(
      `DELETE FROM expert_documents WHERE id = $1`,
      [documentId]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('DELETE DOCUMENT ERROR:', error);
    res.status(500).json({ message: 'Delete failed' });
  }
};
export const updateAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatar_url } = req.body;

    await pool.query(
      `UPDATE profiles SET avatar_url = $1 WHERE id = $2`,
      [avatar_url, userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update avatar' });
  }
};

export const updateBanner = async (req, res) => {
  try {
    const userId = req.user.id;
    const { banner_url } = req.body;

    await pool.query(
      `UPDATE profiles SET banner_url = $1 WHERE id = $2`,
      [banner_url, userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update banner' });
  }
};

export const uploadProfileMedia = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;
    const file = req.file;

    if (!['avatar', 'banner'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type' });
    }
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const folder = type === 'avatar' ? 'avatars' : 'banners';
    const ext = path.extname(file.originalname);
    const filePath = `${folder}/${userId}${ext}`;

    const { error } = await supabase.storage
      .from('profile-media')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });
    if (error) throw error;

    const { data } = supabase.storage
      .from('profile-media')
      .getPublicUrl(filePath);

    res.json({ success: true, url: data.publicUrl });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Upload failed' });
  }
};

async function callSemanticSearchService(query, limit) {
  const PYTHON_SERVICE_URL =
    process.env.PYTHON_SEMANTIC_SEARCH_URL || 'http://127.0.0.1:8000';

  const response = await fetch(`${PYTHON_SERVICE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    throw new Error(`Python service returned ${response.status}`);
  }

  return response.json();
}

export default {
  searchExperts,
  semanticSearch,
  getExpertById,
  updateExpertProfile,
  getResumeSignedUrl,
  uploadExpertDocument,
  deleteExpertDocument,
  updateAvatar,
  updateBanner,
  uploadProfileMedia
};