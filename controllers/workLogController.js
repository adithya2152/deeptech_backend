import WorkLog from '../models/workLogModel.js';

export const logHours = async (req, res) => {
  try {
    const log = await WorkLog.createLog(req.params.id, req.user.id, req.body);
    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getHourLogs = async (req, res) => {
  try {
    const logs = await WorkLog.getLogsByContract(req.params.id);
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveHourLog = async (req, res) => {
  try {
    const log = await WorkLog.updateStatus(req.params.logId, 'approved', req.body.comment);
    res.status(200).json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const rejectHourLog = async (req, res) => {
  try {
    const log = await WorkLog.updateStatus(req.params.logId, 'rejected', req.body.reason);
    res.status(200).json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getWeeklySummary = async (req, res) => {
  try {
    const { id } = req.params;
    const { week } = req.query;
    const summary = await WorkLog.getWeeklySummary(id, week);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  logHours,
  getHourLogs,
  approveHourLog,
  rejectHourLog,
  getWeeklySummary
};