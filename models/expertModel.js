const pool = require('../config/db');

exports.findExperts = async (domain, queryText) => {
  let sqlText = `
    SELECT 
      p.id, p.first_name, p.last_name, p.profile_picture_url, p.title, p.bio,
      e.domains, e.hourly_rate_advisory, e.hourly_rate_execution, e.experience_summary, e.rating, e.review_count
    FROM experts e
    JOIN profiles p ON e.id = p.id
    WHERE 1=1
  `;
  
  let sqlParams = [];
  let paramCounter = 1;

  if (domain) {
    sqlText += ` AND $${paramCounter} = ANY(e.domains)`;
    sqlParams.push(domain);
    paramCounter++;
  }

  if (queryText) {
    sqlText += ` AND (p.bio ILIKE $${paramCounter} OR p.first_name ILIKE $${paramCounter} OR p.last_name ILIKE $${paramCounter} OR e.experience_summary ILIKE $${paramCounter})`;
    sqlParams.push(`%${queryText}%`);
    paramCounter++;
  }

  const { rows } = await pool.query(sqlText, sqlParams);
  return rows;
};