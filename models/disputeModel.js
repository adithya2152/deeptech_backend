import pool from "../config/db.js";

const DisputeModel = {
  create: async ({ contract_id, raised_by, reason, description, evidence }) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get the contract with profile IDs
      const contractQuery = `SELECT buyer_profile_id, expert_profile_id, status FROM contracts WHERE id = $1`;
      const contractRes = await client.query(contractQuery, [contract_id]);

      if (contractRes.rows.length === 0) {
        throw new Error('Contract not found');
      }

      const contract = contractRes.rows[0];

      // raised_by is a user_accounts.id, we need to find the matching profile ID
      // and determine if they are buyer or expert
      const profileQuery = `SELECT id, profile_type FROM profiles WHERE user_id = $1`;
      const profileRes = await client.query(profileQuery, [raised_by]);

      if (profileRes.rows.length === 0) {
        throw new Error('User profile not found');
      }

      // Find the profile that matches this contract
      let raised_by_type = '';
      let raised_by_profile_id = null;

      for (const profile of profileRes.rows) {
        if (profile.id === contract.buyer_profile_id) {
          raised_by_type = 'buyer';
          raised_by_profile_id = profile.id;
          break;
        } else if (profile.id === contract.expert_profile_id) {
          raised_by_type = 'expert';
          raised_by_profile_id = profile.id;
          break;
        }
      }

      if (!raised_by_profile_id) {
        throw new Error('User is not a party to this contract');
      }

      const insertQuery = `
        INSERT INTO disputes (contract_id, raised_by, raised_by_type, reason, description, evidence)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, status
      `;
      // Store the profile_id in raised_by, not the user_account id
      const values = [contract_id, raised_by_profile_id, raised_by_type, reason, description, JSON.stringify(evidence || [])];
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