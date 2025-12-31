import DisputeModel from '../models/disputeModel.js';

const disputeController = {
  createDispute: async (req, res) => {
    try {
      const { contract_id, reason, description, evidence } = req.body;
      const raised_by = req.user.id;

      if (!contract_id || !reason || !description) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: contract_id, reason, or description.'
        });
      }

      const dispute = await DisputeModel.create({
        contract_id,
        raised_by,
        reason,
        description,
        evidence
      });

      res.status(201).json({
        success: true,
        message: 'Dispute raised successfully. Contract paused.',
        data: dispute
      });
    } catch (error) {
      console.error('Error raising dispute:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Internal server error' 
      });
    }
  }
};

export default disputeController;