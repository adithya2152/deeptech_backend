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

      avg_daily_rate: expert.avg_daily_rate ?? null,
      avg_fixed_rate: expert.avg_fixed_rate ?? null,
      avg_sprint_rate: expert.avg_sprint_rate ?? null,

      vetting_status: expert.vetting_status,
      vetting_level: expert.vetting_level ?? null,
      expert_status: expert.expert_status,

      rating: expert.rating,
      review_count: expert.review_count,
      total_hours: expert.total_hours,
      availability: expert.availability,

      years_experience: expert.years_experience,
      languages: expert.languages,
      profile_video_url: expert.profile_video_url,
      preferred_engagement_mode: expert.preferred_engagement_mode
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
  uploadExpertDocument
};