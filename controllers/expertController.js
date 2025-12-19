const expertModel = require('../models/expertModel');

exports.searchExperts = async (req, res) => {
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
    res.status(200).json({ experts });
  } catch (error) {
    console.error("SEARCH ERROR:", error); 
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getExpertById = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await expertModel.getExpertById(id);

    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    res.status(200).json(expert);
  } catch (error) {
    console.error("GET ID ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};