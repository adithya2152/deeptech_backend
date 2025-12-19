const pool = require('../config/db');

exports.createProject = async (data) => {
  const { title, description, domain, trlLevel, expectedOutcome, clientId, riskCategories, budgetMin, budgetMax, deadline } = data;

  const query = `
    INSERT INTO projects (title, description, domain, trl_level, expected_outcome, client_id, status, risk_categories, budget_min, budget_max, deadline)
    VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10)
    RETURNING *;
  `;

  const values = [title, description, domain, trlLevel, expectedOutcome, clientId, riskCategories, budgetMin || null, budgetMax || null, deadline || null];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

exports.updateProject = async (id, data) => {
  const { title, description, domain, trlLevel, expectedOutcome, riskCategories, budgetMin, budgetMax, deadline, status } = data;

  const query = `
    UPDATE projects 
    SET 
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      domain = COALESCE($3, domain),
      trl_level = COALESCE($4, trl_level),
      expected_outcome = COALESCE($5, expected_outcome),
      risk_categories = COALESCE($6, risk_categories),
      budget_min = COALESCE($7, budget_min),
      budget_max = COALESCE($8, budget_max),
      deadline = COALESCE($9, deadline),
      status = COALESCE($10, status),
      updated_at = NOW()
    WHERE id = $11
    RETURNING *;
  `;

  const values = [title, description, domain, trlLevel, expectedOutcome, riskCategories, budgetMin, budgetMax, deadline, status, id];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

exports.deleteProject = async (id) => {
  const query = 'DELETE FROM projects WHERE id = $1 RETURNING *;';
  const { rows } = await pool.query(query, [id]);
  return rows[0];
};