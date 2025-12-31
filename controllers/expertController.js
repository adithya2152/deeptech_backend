import expertModel from '../models/expertModel.js';

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

      hourly_rate_advisory: expert.hourly_rates?.advisory ?? null,
      hourly_rate_architecture: expert.hourly_rates?.architecture_review ?? null,
      hourly_rate_execution: expert.hourly_rates?.hands_on_execution ?? null,

      vetting_status: expert.vetting_status,
      vetting_level: expert.vetting_level ?? null,

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

// Helper function to call Python semantic search service
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
  getExpertById
};