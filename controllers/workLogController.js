import WorkLog from '../models/workLogModel.js';

export const logHours = async (req, res) => {
  try {
    const contract_id = req.params.id;
    const expert_id = req.user.id;

    console.log("RECEIVED BODY:", req.body);

    const { 
      log_date,     
      hours_worked,  
      description, 
      value_tags 
    } = req.body;

    if (!log_date || !hours_worked) {
      return res.status(400).json({ 
        success: false, 
        error: `Missing required fields: log_date is ${log_date}, hours_worked is ${hours_worked}` 
      });
    }

    const log_data = {
      log_date,
      hours_worked,
      description,
      value_tags
    };

    const new_log = await WorkLog.createLog(contract_id, expert_id, log_data);

    res.status(201).json({ success: true, data: new_log });
  } catch (error) {
    console.error("LOG HOURS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getHourLogs = async (req, res) => {
  try {
    const contract_id = req.params.id;
    const userId = req.user.id; // ✅ Get the logged-in user's ID

    // ✅ Pass userId to the model so it can verify access (Buyer OR Expert)
    const logs = await WorkLog.getLogsByContract(contract_id, userId);

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error("GET LOGS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const approveHourLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const updated_log = await WorkLog.updateStatus(logId, 'approved');

    res.status(200).json({
      success: true,
      message: "Hour log approved",
      data: updated_log
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const rejectHourLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const { reason } = req.body;
    const updated_log = await WorkLog.updateStatus(logId, 'rejected', reason);

    res.status(200).json({
      success: true,
      message: "Hour log rejected",
      data: updated_log
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getWeeklySummary = async (req, res) => {
  try {
    const contract_id = req.params.id;
    const { week_start } = req.query;

    const summary = await WorkLog.getWeeklySummary(contract_id, week_start);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  logHours,
  getHourLogs,
  approveHourLog,
  rejectHourLog,
  getWeeklySummary
};