import ReportModel from '../models/reportModel.js';

const reportController = {
  createReport: async (req, res) => {
    try {
      const { reported_id, type, description, evidence } = req.body;
      const reporter_id = req.user.id; 

      if (!reported_id || !type || !description) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields: reported_id, type, or description.' 
        });
      }

      const report = await ReportModel.create({
        reporter_id,
        reported_id,
        type,
        description,
        evidence
      });

      res.status(201).json({
        success: true,
        message: 'Report submitted successfully.',
        data: report
      });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
};

export default reportController;