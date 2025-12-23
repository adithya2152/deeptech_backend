import pool from '../config/db.js';

const Contract = {
  createContract: async (data) => {
    const {
      project_id,
      buyer_id,
      expert_id,
      hourly_rate,
      engagement_type,
      weekly_hour_cap,
      start_date,
      end_date,
      ip_ownership
    } = data;

    const query = `
      INSERT INTO contracts (
        project_id, 
        buyer_id, 
        expert_id, 
        hourly_rate, 
        engagement_type, 
        weekly_hour_cap, 
        start_date, 
        end_date, 
        ip_ownership, 
        status,
        total_hours_logged,
        total_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, 0)
      RETURNING *;
    `;

    const values = [
      project_id,
      buyer_id,
      expert_id,
      hourly_rate,
      engagement_type,
      weekly_hour_cap,
      start_date,
      end_date,
      ip_ownership
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  getContractById: async (id) => {
    const query = `
      SELECT 
        c.*, 
        p.title as project_title,
        p.description as project_description,
        p.domain as project_domain,
        p.trl_level as project_trl,
        -- Expert Details (Profiles join)
        ue.first_name as expert_first_name, 
        ue.last_name as expert_last_name,
        ue.email as expert_email,
        -- Buyer Details (Profiles join)
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
    const column = role === 'expert' ? 'expert_id' : 'buyer_id';

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
  }
};

export default Contract;