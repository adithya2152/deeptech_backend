const expertModel = require('../models/expertModel');

exports.searchExperts = async (req, res) => {
  try {
    const { query, domain } = req.query;
    
    const experts = await expertModel.findExperts(domain, query);
    
    res.json(experts);

  } catch (error) {
    console.error(error.message);
    res.status(400).json({ error: error.message });
  }
};