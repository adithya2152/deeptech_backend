import pool from "../config/db.js";

const DisputeModel = {
  create: async ({ contract_id, raised_by, reason, description, evidence }) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const contractQuery = `SELECT buyer_id, expert_id, status FROM contracts WHERE id = $1`;
      const contractRes = await client.query(contractQuery, [contract_id]);
      
      if (contractRes.rows.length === 0) {
        throw new Error('Contract not found');
      }

      const contract = contractRes.rows[0];
      let raised_by_type = '';

      if (raised_by === contract.buyer_id) raised_by_type = 'buyer';
      else if (raised_by === contract.expert_id) raised_by_type = 'expert';
      else throw new Error('User is not a party to this contract');

      const insertQuery = `
        INSERT INTO disputes (contract_id, raised_by, raised_by_type, reason, description, evidence)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, status
      `;
      const values = [contract_id, raised_by, raised_by_type, reason, description, JSON.stringify(evidence || [])];
      const { rows } = await client.query(insertQuery, values);

      const updateContract = `UPDATE contracts SET status = 'paused' WHERE id = $1`;
      await client.query(updateContract, [contract_id]);

      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export default DisputeModel;