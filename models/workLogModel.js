import pool from "../config/db.js";

const WorkLog = {
  // Create a new work log (matches Supabase schema)
  create: async (data) => {
    const {
      contract_id,
      type,
      checklist,
      problems_faced,
      sprint_number,
      evidence,
      description,
      log_date,
    } = data;

    const query = `
      INSERT INTO work_logs (
        contract_id,
        type,
        checklist,
        problems_faced,
        sprint_number,
        evidence,
        description,
        log_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()::date))
      RETURNING *;
    `;

    const values = [
      contract_id,
      type,
      checklist ? JSON.stringify(checklist) : null,
      problems_faced ?? null,
      sprint_number ?? null,
      evidence ? JSON.stringify(evidence) : null,
      description ?? null,
      log_date ?? null,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Get work log by ID
  getById: async (id) => {
    const query = `SELECT * FROM work_logs WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get all work logs for a contract
  getByContractId: async (contract_id) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Get work logs by expert (via contract)
  getByExpertProfileId: async (expert_profile_id) => {
    const query = `
      SELECT wl.* 
      FROM work_logs wl
      JOIN contracts c ON wl.contract_id = c.id
      WHERE c.expert_profile_id = $1
      ORDER BY wl.created_at DESC
    `;
    const { rows } = await pool.query(query, [expert_profile_id]);
    return rows;
  },

  // Check for recent daily logs (24-hour limit)
  getRecentDailyLogs: async (contract_id) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
        AND type = 'daily_log'
        AND created_at > NOW() - INTERVAL '24 hours'
        AND status != 'rejected'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Get sprint logs for a specific sprint
  getSprintLogs: async (contract_id, sprint_number) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
        AND sprint_number = $2
        AND type = 'sprint_submission'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id, sprint_number]);
    return rows;
  },

  // NEW: Get logs for exact date + type
  getLogsByDateAndType: async (contract_id, type, log_date) => {
    const query = `
      SELECT * FROM work_logs 
      WHERE contract_id = $1 
        AND type = $2
        AND log_date = $3::date
        AND status != 'deleted'
        AND status != 'rejected'
    `;
    const { rows } = await pool.query(query, [contract_id, type, log_date]);
    return rows;
  },

  // NEW: Count sprint submissions for sprint number
  countSprintSubmissions: async (contract_id, sprint_number) => {
    const query = `
      SELECT COUNT(*) as count 
      FROM work_logs 
      WHERE contract_id = $1 
        AND sprint_number = $2
        AND type = 'sprint_submission'
        AND status != 'deleted'
        AND status != 'rejected'
    `;
    const { rows } = await pool.query(query, [contract_id, sprint_number]);
    return parseInt(rows[0].count);
  },

  // NEW: Count approved sprint submissions for a sprint number
  countApprovedSprintSubmissions: async (contract_id, sprint_number) => {
    const query = `
      SELECT COUNT(*) as count
      FROM work_logs
      WHERE contract_id = $1
        AND sprint_number = $2
        AND type = 'sprint_submission'
        AND status = 'approved'
    `;

    const { rows } = await pool.query(query, [contract_id, sprint_number]);
    return parseInt(rows[0].count);
  },

  // NEW: Count milestone requests total
  countMilestoneRequests: async (contract_id) => {
    const query = `
      SELECT COUNT(*) as count 
      FROM work_logs 
      WHERE contract_id = $1 
        AND type = 'milestone_request'
        AND status != 'deleted'
        AND status != 'rejected'  
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return parseInt(rows[0].count);
  },

  // NEW: Validate submission limits
  validateSubmission: async (contract_id, type, sprint_number, log_date) => {
    switch (type) {
      case 'daily_log':
        // Check exact date
        const dateLogs = await WorkLog.getLogsByDateAndType(contract_id, type, log_date);
        if (dateLogs.length > 0) {
          return `Already submitted for ${log_date}`;
        }
        // Check 24h window
        const recentLogs = await WorkLog.getRecentDailyLogs(contract_id);
        if (recentLogs.length > 0) {
          return 'Only 1 daily log per 24 hours allowed';
        }
        return null;

      case 'sprint_submission':
        const sprintCount = await WorkLog.countSprintSubmissions(contract_id, sprint_number);
        if (sprintCount >= 3) {
          return 'Max 3 submissions per sprint reached';
        }
        return null;

      case 'milestone_request':
        const milestoneCount = await WorkLog.countMilestoneRequests(contract_id);
        if (milestoneCount >= 5) {
          return 'Max 5 milestone requests per contract reached';
        }
        return null;

      default:
        return null;
    }
  },

  // Update work log status (for finishing sprint)
  updateStatus: async (id, data) => {
    const { status, buyer_comment } = data;

    const query = `
      UPDATE work_logs 
      SET 
        status = COALESCE($2, status),
        buyer_comment = COALESCE($3, buyer_comment)
      WHERE id = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      id,
      status,
      buyer_comment ?? null,
    ]);

    return rows[0];
  },

  // Update work log
  update: async (id, data) => {
    const { checklist, problems_faced, evidence, description } = data;

    const query = `
    UPDATE work_logs 
    SET 
      checklist = COALESCE($1, checklist),
      problems_faced = COALESCE($2, problems_faced),
      evidence = COALESCE($3, evidence),
      description = COALESCE($4, description)
    WHERE id = $5
    RETURNING *;
  `;

    const { rows } = await pool.query(query, [
      checklist ? JSON.stringify(checklist) : null,
      problems_faced ?? null,
      evidence ? JSON.stringify(evidence) : null,
      description ?? null,
      id,
    ]);
    return rows[0];
  },

  // Delete work log
  delete: async (id) => {
    const query = `DELETE FROM work_logs WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },
};

export default WorkLog;
