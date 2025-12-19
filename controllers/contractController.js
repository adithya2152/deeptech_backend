import Contract from '../models/contractModel.js';
import WorkLog from '../models/workLogModel.js';

export const createContract = async (req, res) => {
  try {
    const mappedData = {
      project_id: req.body.projectId,
      expert_id: req.body.expertId,
      engagement_type: req.body.engagementType || 'hourly',
      hourly_rate: req.body.hourlyRate,
      weekly_hour_cap: req.body.weeklyHourCap,
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      ip_ownership: req.body.ipOwnership,
      buyer_id: req.user.id
    };
    const contract = await Contract.createContract(mappedData);
    res.status(201).json(contract); 
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getContractDetails = async (req, res) => {
  try {
    const contract = await Contract.getContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    res.status(200).json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyContracts = async (req, res) => {
  try {
    const role = req.query.role || 'buyer';
    const contracts = await Contract.getContractsByUser(req.user.id, role);
    res.status(200).json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const acceptContract = async (req, res) => {
  try {
    const updatedContract = await Contract.updateContractStatus(req.params.id, 'active');
    res.status(200).json(updatedContract);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const declineContract = async (req, res) => {
  try {
    const updated = await Contract.updateContractStatus(req.params.id, 'declined', req.body.reason);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const pauseContract = async (req, res) => {
  try {
    const updated = await Contract.updateContractStatus(req.params.id, 'paused', req.body.reason);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const resumeContract = async (req, res) => {
  try {
    const updated = await Contract.updateContractStatus(req.params.id, 'active');
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default {
  createContract,
  getContractDetails,
  getMyContracts,
  acceptContract,
  declineContract,
  pauseContract,
  resumeContract
};