const pool = require('../config/db');

const Contract = {
    createContract: async (contractData) => {
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
        } = contractData;

        const query = `
      INSERT INTO contracts (
        project_id, buyer_id, expert_id, hourly_rate, 
        engagement_type, weekly_hour_cap, start_date, 
        end_date, ip_ownership, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *;
    `;

        const values = [
            project_id, buyer_id, expert_id, hourly_rate,
            engagement_type, weekly_hour_cap, start_date,
            end_date, ip_ownership
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    },

    getContractById: async (id) => {
        const query = `
      SELECT c.*, 
             p.title as project_title,
             u.first_name as expert_first_name, 
             u.last_name as expert_last_name
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN profiles u ON c.expert_id = u.id
      WHERE c.id = $1;
    `;
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    },

    getContractsByUser: async (userId, role) => {
        const column = role === 'expert' ? 'expert_id' : 'buyer_id';
        const query = `SELECT * FROM contracts WHERE ${column} = $1 ORDER BY created_at DESC;`;
        const { rows } = await pool.query(query, [userId]);
        return rows;
    },

    updateContractStatus: async (id, status, reason = null) => {
        const query = `
      UPDATE contracts 
      SET status = $2, status_reason = $3, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *, status_reason as "statusReason";
    `;
        const { rows } = await pool.query(query, [id, status, reason]);
        return rows[0];
    }
};

module.exports = Contract;