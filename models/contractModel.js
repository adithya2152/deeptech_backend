import pool from "../config/db.js";

const Contract = {
  findActiveOrPendingForPair: async (project_id, expert_id) => {
    const query = `
      SELECT *
      FROM contracts
      WHERE project_id = $1
        AND expert_id = $2
        AND status IN ('pending', 'active', 'paused')
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [project_id, expert_id]);
    return rows[0];
  },

  // Create a new contract
  createContract: async (data) => {
    const {
      project_id,
      buyer_id,
      expert_id,
      engagement_model,
      payment_terms,
      start_date,
    } = data;

    const existing = await Contract.findActiveOrPendingForPair(
      project_id,
      expert_id
    );
    if (existing) {
      const error = new Error(
        "A contract already exists between this buyer and expert for this project."
      );
      error.statusCode = 400;
      throw error;
    }

    let total_amount = 0;

    if (engagement_model === "sprint") {
      const sprintRate = Number(payment_terms?.sprint_rate || 0);
      const totalSprints = Number(payment_terms?.total_sprints || 0);
      total_amount = sprintRate * totalSprints;
    }

    if (engagement_model === "daily") {
      const rate = Number(payment_terms?.daily_rate || 0);
      const days = Number(payment_terms?.total_days || 0);
      total_amount = rate * days;
    }

    const query = `
      INSERT INTO contracts (
        project_id, 
        buyer_id, 
        expert_id, 
        engagement_model,
        payment_terms,
        start_date,
        status,
        created_at,
        total_amount       
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), $7)
      RETURNING *;
    `;

    const values = [
      project_id,
      buyer_id,
      expert_id,
      engagement_model,
      JSON.stringify(payment_terms),
      start_date,
      total_amount,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  updateNda: async (contract_id, nda_custom_content, nda_status) => {
    const query = `
      UPDATE contracts 
      SET nda_custom_content = $2, nda_status = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, nda_custom_content, nda_status]);
    return rows[0];
  },

  // Sign NDA and activate contract
  signNdaAndActivate: async (contract_id, signature_name, ip_address) => {
    const query = `
      UPDATE contracts 
      SET 
        status = 'active',
        nda_status = 'signed',
        nda_signed_at = NOW(),
        nda_signature_name = $1,
        nda_ip_address = $2
      WHERE id = $3
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      signature_name,
      ip_address,
      contract_id,
    ]);
    return rows[0];
  },

  // Get contract by ID
  getById: async (id) => {
    const query = `SELECT * FROM contracts WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get contracts by expert ID
  getByExpertId: async (expert_id) => {
    const query = `SELECT * FROM contracts WHERE expert_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [expert_id]);
    return rows;
  },

  // Get contracts by buyer ID
  getByBuyerId: async (buyer_id) => {
    const query = `SELECT * FROM contracts WHERE buyer_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [buyer_id]);
    return rows;
  },

  // Get contracts by project ID
  getByProjectId: async (project_id) => {
    const query = `SELECT * FROM contracts WHERE project_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [project_id]);
    return rows;
  },

  // Pending contract for expert+project
  getPendingContractForExpertAndProject: async (expert_id, project_id) => {
    const query = `
      SELECT * FROM contracts 
      WHERE expert_id = $1 AND project_id = $2 AND status = 'pending'
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [expert_id, project_id]);
    return rows[0];
  },

  // Contract with project + profile details
  getContractWithDetails: async (id) => {
    const query = `
      SELECT 
        c.*, 
        p.title as project_title,
        p.description as project_description,
        p.domain as project_domain,
        p.trl_level as project_trl,
        ue.first_name as expert_first_name, 
        ue.last_name as expert_last_name,
        ue.email as expert_email,
        ub.first_name as buyer_first_name,
        ub.last_name as buyer_last_name
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN profiles ue ON c.expert_id = ue.id
      JOIN profiles ub ON c.buyer_id = ub.id
      WHERE c.id = $1;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getContractsByUser: async (user_id, role) => {
    const column = role === "expert" ? "expert_id" : "buyer_id";

    const query = `
      SELECT 
        c.*, 
        p.title as project_title,
        ue.first_name as expert_first_name, 
        ue.last_name as expert_last_name,
        ub.first_name as buyer_first_name,
        ub.last_name as buyer_last_name
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN profiles ue ON c.expert_id = ue.id
      JOIN profiles ub ON c.buyer_id = ub.id
      WHERE c.${column} = $1 
      ORDER BY c.created_at DESC;
    `;
    const { rows } = await pool.query(query, [user_id]);
    return rows;
  },

  updateContractStatus: async (id, status, reason = null) => {
    const query = `
      UPDATE contracts 
      SET status = $2, status_reason = $3, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [id, status, reason]);
    return rows[0];
  },

  updatePaymentTerms: async (id, payment_terms) => {
    const query = `
      UPDATE contracts
      SET payment_terms = $2
      WHERE id = $1
      RETURNING *;
    `;
    const values = [id, JSON.stringify(payment_terms)];
    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  getInvoices: async (contract_id) => {
    const query = `
      SELECT * FROM invoices 
      WHERE contract_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Fund escrow balance
  fundEscrow: async (contract_id, amount) => {
    const query = `
      UPDATE contracts
      SET 
        escrow_balance = escrow_balance + $2,
        escrow_funded_total = escrow_funded_total + $2
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, amount]);
    return rows[0];
  },

  // Update contract status
  updateStatus: async (contract_id, status) => {
    const query = `
      UPDATE contracts
      SET status = $2
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, status]);
    return rows[0];
  },
};

export default Contract;