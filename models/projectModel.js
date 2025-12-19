const pool = require('../config/db');

// Get all projects for user
exports.getProjectsByUser = async (userId) => {
  const sql = `
    SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows;
};

// Get single project
exports.getProjectById = async (id) => {
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
};

// Create Project
exports.createProject = async (data) => {
  const { 
    client_id, title, description, domain, trl_level, 
    expected_outcome, risk_categories, budget_min, budget_max, deadline 
  } = data;

  const sql = `
    INSERT INTO projects (
      id, client_id, title, description, domain, trl_level, 
      expected_outcome, risk_categories, budget_min, budget_max, deadline, status, created_at
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, 'open', NOW()
    )
    RETURNING *;
  `;
  
  const params = [
    client_id, title, description, domain, trl_level, 
    expected_outcome, risk_categories || [], budget_min, budget_max, deadline
  ];

  const { rows } = await pool.query(sql, params);
  return rows[0];
};

// Update Project
exports.updateProject = async (id, updates) => {
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
};

// Delete Project
exports.deleteProject = async (id) => {
  const sql = `DELETE FROM projects WHERE id = $1 RETURNING id`;
  const { rows } = await pool.query(sql, [id]);
  return rows[0];
};