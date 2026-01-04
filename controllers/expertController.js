import expertModel from '../models/expertModel.js';
import { supabase } from '../config/supabase.js';
import pool from '../config/db.js';

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

    if (!expert) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    res.status(200).json({ data: expert });
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

    const updatedExpert = await expertModel.updateExpertById(id, req.body);

    if (!updatedExpert) {
      return res.status(404).json({
        success: false,
        message: 'Expert not found',
      });
    }

    res.status(200).json({
      success: true,
      data: updatedExpert,
    });
  } catch (error) {
    console.error('UPDATE EXPERT ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expert profile',
    });
  }
};

export const uploadExpertDocument = async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { type, title, url } = req.body;
  const file = req.file;

  const columnMap = {
    patent: 'patents',
    paper: 'papers',
    product: 'products',
  };

  const column = columnMap[type];
  if (!column) {
    return res.status(400).json({ message: 'Invalid document type' });
  }

  let valueToStore;

  if (type === 'product') {
    if (!url) return res.status(400).json({ message: 'URL required' });
    valueToStore = url;
  } else {
    if (!file) return res.status(400).json({ message: 'File required' });

    const filePath = `experts/${req.user.id}/${Date.now()}-${file.originalname}`;

    const { error } = await supabase.storage
      .from('expert-documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) return res.status(500).json({ error: error.message });

    valueToStore = supabase.storage
      .from('expert-documents')
      .getPublicUrl(filePath).data.publicUrl;
  }

  await pool.query(
    `UPDATE experts SET ${column} = array_append(${column}, $1) WHERE id = $2`,
    [valueToStore, req.user.id]
  );

  res.json({ success: true });
};

export const deleteExpertDocument = async (req, res) => {
  const { type, url } = req.body;
  const userId = req.user.id;
  const allowed = ['patent', 'paper', 'product'];
  
  if (!allowed.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid type' });
  }

  // extract file path from public URL
  const filePath = url.split('/').slice(-2).join('/');

  // 1️⃣ delete from bucket
  const { error } = await supabase.storage
    .from('expert-documents')
    .remove([filePath]);

  if (error) {
    console.error('Bucket delete failed:', error);
    return res.status(500).json({ success: false });
  }

  // 2️⃣ update DB array
  await pool.query(
    `UPDATE experts
     SET ${type}s = array_remove(${type}s, $1)
     WHERE id = $2`,
    [url, userId]
  );

  res.json({ success: true });
};

export const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // 1️⃣ Get existing avatar URL
    const { rows } = await pool.query(
      'SELECT avatar_url FROM profiles WHERE id = $1',
      [userId]
    );

    const oldAvatarUrl = rows[0]?.avatar_url;

    // 3️⃣ Upload new avatar (stable path)
    const filePath = `${userId}/avatar.png`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 4️⃣ Get public URL
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // 5️⃣ Update DB
    await pool.query(
      'UPDATE profiles SET avatar_url = $1 WHERE id = $2',
      [data.publicUrl, userId]
    );

    res.json({ success: true, url: data.publicUrl });

  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ success: false, message: 'Avatar upload failed' });
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
  uploadExpertDocument,
  deleteExpertDocument,
  uploadAvatar
};