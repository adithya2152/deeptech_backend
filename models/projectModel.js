import pool from '../config/db.js';

const Project = {
  getProjectsByClient: async (clientId) => {
    const sql = `
      SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(sql, [clientId]);
    return rows;
  },

  getById: async (id) => {
    const sql = `
      SELECT 
        p.*, 
        json_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name, 'email', u.email) as client
      FROM projects p
      JOIN profiles u ON p.client_id = u.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  },

  create: async (data) => {
    const { 
      client_id, title, description, domain, trl_level, 
      expected_outcome, risk_categories, budget_min, budget_max, deadline 
    } = data;

    const sql = `
      INSERT INTO projects (
        client_id, title, description, domain, trl_level, 
        expected_outcome, risk_categories, budget_min, budget_max, deadline, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, 'open'
      )
      RETURNING *;
    `;
    
    const params = [
      client_id, title, description, domain, trl_level, 
      expected_outcome, risk_categories || [], budget_min, budget_max, deadline
    ];

    const { rows } = await pool.query(sql, params);
    return rows[0];
  },

  update: async (id, updates) => {
    const sql = `
      UPDATE projects 
      SET title = COALESCE($2, title),
          description = COALESCE($3, description),
          status = COALESCE($4, status),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(sql, [id, updates.title, updates.description, updates.status]);
    return rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM projects WHERE id = $1 RETURNING id`;
    const { rows } = await pool.query(sql, [id]);
    return rows[0];
  }
};

export default Project;