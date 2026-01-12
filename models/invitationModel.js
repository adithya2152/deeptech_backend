import pool from '../config/db.js';

export const Invitation = {
  async findPending(projectId, expertProfileId) {
    const result = await pool.query(
      'SELECT id FROM project_invitations WHERE project_id = $1 AND expert_profile_id = $2 AND status = $3',
      [projectId, expertProfileId, 'pending']
    );
    return result.rows[0];
  },

  async create(projectId, expertProfileId, message) {
    const result = await pool.query(
      `INSERT INTO project_invitations (project_id, expert_profile_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [projectId, expertProfileId, message]
    );
    return result.rows[0];
  },

  async getByExpertProfileId(expertProfileId) {
    const result = await pool.query(
      `SELECT pi.*,
              json_build_object(
                'id', proj.id,
                'title', proj.title,
                'description', proj.description,
                'budget_min', proj.budget_min,
                'budget_max', proj.budget_max,
                'type', proj.domain,
                'duration', proj.deadline
              ) as project,
              json_build_object(
                'first_name', u.first_name,
                'last_name', u.last_name,
                'avatar_url', u.avatar_url
              ) as buyer
       FROM project_invitations pi
       JOIN projects proj ON pi.project_id = proj.id
       JOIN profiles bp ON proj.buyer_profile_id = bp.id
       JOIN user_accounts u ON bp.user_id = u.id
       WHERE pi.expert_profile_id = $1
       ORDER BY pi.created_at DESC`,
      [expertProfileId]
    );
    return result.rows;
  },

  async updateStatus(id, expertProfileId, status) {
    const result = await pool.query(
      `UPDATE project_invitations
       SET status = $1
       WHERE id = $2 AND expert_profile_id = $3
       RETURNING *`,
      [status, id, expertProfileId]
    );
    return result.rows[0];
  },

  async acceptInvitationTransaction(id, expertProfileId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update Invitation Status
      const invRes = await client.query(
        `UPDATE project_invitations 
         SET status = 'accepted' 
         WHERE id = $1 AND expert_profile_id = $2 
         RETURNING *`,
        [id, expertProfileId]
      );

      if (invRes.rows.length === 0) {
        throw new Error('Invitation not found or unauthorized');
      }
      const invitation = invRes.rows[0];

      // 2. Get Project Details
      const projectRes = await client.query(
        'SELECT * FROM projects WHERE id = $1',
        [invitation.project_id]
      );
      const project = projectRes.rows[0];

      // 3. Update Project Status to Active (expert is linked through contract, not project)
      await client.query(
        `UPDATE projects 
         SET status = 'active', updated_at = NOW() 
         WHERE id = $1`,
        [invitation.project_id]
      );

      // 4. Create Contract (Draft/Pending)
      // Using 'daily' as a default engagement model since actual terms are negotiated in contract phase
      const contractRes = await client.query(
        `INSERT INTO contracts (
           project_id, buyer_profile_id, expert_profile_id, 
           engagement_model, payment_terms, status, start_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id`,
        [
          project.id,
          project.buyer_profile_id,
          expertProfileId,
          'daily', // Default initial model
          JSON.stringify({ rate: 0, currency: 'USD', note: 'Draft terms from invitation' }),
          'pending',
          new Date()
        ]
      );

      await client.query('COMMIT');

      return {
        invitation,
        contractId: contractRes.rows[0].id
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async verifyProjectOwnership(projectId, buyerProfileId) {
    const result = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND buyer_profile_id = $2',
      [projectId, buyerProfileId]
    );
    return result.rows.length > 0;
  }
};