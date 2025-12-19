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

export const getExpertById = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await expertModel.getExpertById(id);

    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    res.status(200).json({ data: expert });
  } catch (error) {
    console.error("GET ID ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export default {
  searchExperts,
  getExpertById
};