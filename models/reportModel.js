import pool from "../config/db.js";

const ReportModel = {
  create: async ({ reporter_id, reported_id, type, description, evidence }) => {
    const query = `
      INSERT INTO reports (reporter_id, reported_id, type, description, evidence)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at, status
    `;
    const values = [reporter_id, reported_id, type, description, JSON.stringify(evidence || [])];
    const { rows } = await pool.query(query, values);
    return rows[0];
  },
};

export default ReportModel;