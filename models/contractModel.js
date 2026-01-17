import pool from "../config/db.js";

const Contract = {
  findActiveOrPendingForPair: async (project_id, expert_profile_id) => {
    const query = `
      SELECT *
      FROM contracts
      WHERE project_id = $1
        AND expert_profile_id = $2
        AND status IN ('pending', 'active', 'paused')
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [project_id, expert_profile_id]);
    return rows[0];
  },

  createContract: async (data) => {
    const {
      project_id,
      buyer_profile_id,
      expert_profile_id,
      engagement_model,
      payment_terms,
      start_date,
    } = data;

    const existing = await Contract.findActiveOrPendingForPair(
      project_id,
      expert_profile_id
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

    if (engagement_model === "fixed") {
      total_amount = Number(payment_terms?.total_amount || 0);
    }

    if (engagement_model === "hourly") {
      const hourlyRate = Number(payment_terms?.hourly_rate || 0);
      const estimatedHours = Number(payment_terms?.estimated_hours || 0);

      // Hourly contracts can be open-ended; if estimated hours are provided,
      // treat that as the contract's estimated value for UI + funding.
      total_amount = hourlyRate > 0 && estimatedHours > 0 ? hourlyRate * estimatedHours : 0;
    }

    const query = `
      INSERT INTO contracts (
        project_id, 
        buyer_profile_id, 
        expert_profile_id, 
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
      buyer_profile_id,
      expert_profile_id,
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

  signNdaAndActivate: async (contract_id, signature_name, ip_address) => {
    // Legacy function - kept for safety, but logic moved to separate steps
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
    const { rows } = await pool.query(query, [signature_name, ip_address, contract_id]);
    return rows[0];
  },

  signContract: async (contract_id, role, signature_name) => {
    // role: 'buyer' | 'expert'
    const column = role === "buyer" ? "buyer_signed_at" : "expert_signed_at";
    const sigColumn = role === "buyer" ? "buyer_signature_name" : "expert_signature_name";

    const query = `
      UPDATE contracts
      SET ${column} = NOW(), ${sigColumn} = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, signature_name]);
    return rows[0];
  },

  signNda: async (contract_id, signature_name, ip_address) => {
    const query = `
      UPDATE contracts 
      SET 
        nda_status = 'signed', 
        nda_signed_at = NOW(), 
        nda_signature_name = $1, 
        nda_ip_address = $2 
      WHERE id = $3 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [signature_name, ip_address, contract_id]);
    return rows[0];
  },

  activateContract: async (contract_id) => {
    const query = `
      UPDATE contracts 
      SET status = 'active', updated_at = NOW()
      WHERE id = $1 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows[0];
  },

  getById: async (id) => {
    const query = `SELECT * FROM contracts WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getByExpertProfileId: async (expert_profile_id) => {
    const query = `SELECT * FROM contracts WHERE expert_profile_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [expert_profile_id]);
    return rows;
  },

  getByBuyerProfileId: async (buyer_profile_id) => {
    const query = `SELECT * FROM contracts WHERE buyer_profile_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [buyer_profile_id]);
    return rows;
  },

  getByProjectId: async (project_id) => {
    const query = `SELECT * FROM contracts WHERE project_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [project_id]);
    return rows;
  },

  getPendingContractForExpertAndProject: async (expert_profile_id, project_id) => {
    const query = `
      SELECT * FROM contracts 
      WHERE expert_profile_id = $1 AND project_id = $2 AND status = 'pending'
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [expert_profile_id, project_id]);
    return rows[0];
  },

  getContractWithDetails: async (id) => {
    const query = `
      SELECT 
        c.*, 
        p.title as project_title,
        p.description as project_description,
        p.domain as project_domain,
        p.trl_level as project_trl,
        ue.id as expert_user_id,
        ue.first_name as expert_first_name, 
        ue.last_name as expert_last_name,
        ue.email as expert_email,
        ub.id as buyer_user_id,
        ub.first_name as buyer_first_name,
        ub.last_name as buyer_last_name
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN profiles pe ON c.expert_profile_id = pe.id
      JOIN user_accounts ue ON pe.user_id = ue.id
      JOIN profiles pb ON c.buyer_profile_id = pb.id
      JOIN user_accounts ub ON pb.user_id = ub.id
      WHERE c.id = $1;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getContractsByUser: async (profile_id, role) => {
    const column = role === "expert" ? "expert_profile_id" : "buyer_profile_id";

    const query = `
      SELECT 
        c.*, 
        p.title as project_title,
        ue.id as expert_user_id,
        ue.first_name as expert_first_name, 
        ue.last_name as expert_last_name,
        ub.id as buyer_user_id,
        ub.first_name as buyer_first_name,
        ub.last_name as buyer_last_name
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN profiles pe ON c.expert_profile_id = pe.id
      JOIN user_accounts ue ON pe.user_id = ue.id
      JOIN profiles pb ON c.buyer_profile_id = pb.id
      JOIN user_accounts ub ON pb.user_id = ub.id
      WHERE c.${column} = $1 
      ORDER BY c.created_at DESC;
    `;
    const { rows } = await pool.query(query, [profile_id]);
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

  fundEscrow: async (contract_id, amount) => {
    const query = `
      UPDATE contracts
      SET 
        escrow_balance = COALESCE(escrow_balance, 0) + $2,
        escrow_funded_total = COALESCE(escrow_funded_total, 0) + $2
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, amount]);
    return rows[0];
  },

  releaseEscrow: async (contract_id, amount) => {
    const query = `
      UPDATE contracts
      SET 
        escrow_balance = GREATEST(COALESCE(escrow_balance, 0) - $2, 0),
        released_total = COALESCE(released_total, 0) + $2
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, amount]);
    return rows[0];
  },

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

  checkFeedbackExists: async (contract_id, giver_id) => {
    const query = `SELECT id FROM feedback WHERE contract_id = $1 AND giver_id = $2`;
    const { rows } = await pool.query(query, [contract_id, giver_id]);
    return rows.length > 0;
  },

  createFeedback: async (contract_id, giver_id, receiver_id, rating, comment, is_positive, receiver_role = 'expert') => {
    const query = `
      INSERT INTO feedback (contract_id, giver_id, receiver_id, rating, comment, is_positive, receiver_role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [contract_id, giver_id, receiver_id, rating, comment, is_positive, receiver_role]);
    return rows[0];
  },

  getFeedbackByContractId: async (contract_id) => {
    const query = `
      SELECT f.*, u.first_name, u.last_name, u.avatar_url
      FROM feedback f
      JOIN profiles p ON f.giver_id = p.id
      JOIN user_accounts u ON p.user_id = u.id
      WHERE contract_id = $1
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  updateExpertRating: async (expert_profile_id) => {
    const stats = await pool.query(
      `SELECT AVG(rating) as new_rating, COUNT(*) as count 
       FROM feedback WHERE receiver_id = $1 AND receiver_role = 'expert'`,
      [expert_profile_id]
    );

    await pool.query(
      `UPDATE experts SET rating = $1, review_count = $2 WHERE expert_profile_id = $3`,
      [parseFloat(stats.rows[0].new_rating || 0).toFixed(1), stats.rows[0].count, expert_profile_id]
    );
  }
};

export default Contract;