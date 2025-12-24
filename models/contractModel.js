import pool from "../config/db.js";

const Contract = {
  // Create a new contract (matches Supabase schema)
  createContract: async (data) => {
    const {
      project_id,
      buyer_id,
      expert_id,
      engagement_model,
      payment_terms,
      start_date,
    } = data;

    const query = `
      INSERT INTO contracts (
        project_id, 
        buyer_id, 
        expert_id, 
        engagement_model,
        payment_terms,
        start_date,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING *;
    `;

    const values = [
      project_id,
      buyer_id,
      expert_id,
      engagement_model,
      JSON.stringify(payment_terms),
      start_date,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Sign NDA and activate contract
  signNdaAndActivate: async (contract_id, signature_name, ip_address) => {
    const query = `
      UPDATE contracts 
      SET 
        status = 'active',
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

  // Get contract by ID with basic info
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

  // Check for pending contract (for NDA gating)
  getPendingContractForExpertAndProject: async (expert_id, project_id) => {
    const query = `
      SELECT * FROM contracts 
      WHERE expert_id = $1 AND project_id = $2 AND status = 'pending'
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [expert_id, project_id]);
    return rows[0];
  },

  // Get contract with detailed project and user info
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

  getInvoices: async (contract_id) => {
    const query = `SELECT * FROM invoices WHERE contract_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },
};

export default Contract;
