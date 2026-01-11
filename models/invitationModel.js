import pool from '../config/db.js';

export const Invitation = {
  async findPending(projectId, expertId) {
    const result = await pool.query(
      'SELECT id FROM project_invitations WHERE project_id = $1 AND expert_id = $2 AND status = $3',
      [projectId, expertId, 'pending']
    );
    return result.rows[0];
  },

  async create(projectId, expertId, message) {
    const result = await pool.query(
      `INSERT INTO project_invitations (project_id, expert_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [projectId, expertId, message]
    );
    return result.rows[0];
  },

  async getByExpertId(expertId) {
    const result = await pool.query(
      `SELECT pi.*,
              json_build_object(
                'id', p.id,
                'title', p.title,
                'description', p.description,
                'budget_min', p.budget_min,
                'budget_max', p.budget_max,
                'type', p.domain,
                'duration', p.deadline
              ) as project,
              json_build_object(
                'first_name', pr.first_name,
                'last_name', pr.last_name,
                'avatar_url', pr.avatar_url
              ) as buyer
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN profiles pr ON p.buyer_id = pr.id
       WHERE pi.expert_id = $1
       ORDER BY pi.created_at DESC`,
      [expertId]
    );
    return result.rows;
  },

  async updateStatus(id, expertId, status) {
    const result = await pool.query(
      `UPDATE project_invitations
       SET status = $1
       WHERE id = $2 AND expert_id = $3
       RETURNING *`,
      [status, id, expertId]
    );
    return result.rows[0];
  },

  async acceptInvitationTransaction(id, expertId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update Invitation Status
      const invRes = await client.query(
        `UPDATE project_invitations 
         SET status = 'accepted' 
         WHERE id = $1 AND expert_id = $2 
         RETURNING *`,
        [id, expertId]
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

      // 3. Update Project Status to Active and assign Expert
      await client.query(
        `UPDATE projects 
         SET status = 'active', expert_id = $1, updated_at = NOW() 
         WHERE id = $2`,
        [expertId, invitation.project_id]
      );

      // 4. Create Contract (Draft/Pending)
      // Using 'daily' as a default engagement model since actual terms are negotiated in contract phase
      const contractRes = await client.query(
        `INSERT INTO contracts (
           project_id, buyer_id, expert_id, 
           engagement_model, payment_terms, status, start_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id`,
        [
          project.id,
          project.buyer_id,
          expertId,
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

  async verifyProjectOwnership(projectId, buyerId) {
     const result = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND buyer_id = $2',
      [projectId, buyerId]
    );
    return result.rows.length > 0;
  }
};