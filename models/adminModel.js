import pool from "../config/db.js";

const AdminModel = {
  getStats: async () => {
    const query = `
      SELECT 
        COALESCE(SUM(released_total), 0) as total_revenue,
        (SELECT COUNT(*) FROM projects WHERE status IN ('active', 'in_progress')) as active_projects,
        (SELECT COUNT(*) FROM contracts WHERE status = 'active') as active_contracts,
        (SELECT COUNT(*) FROM disputes WHERE status = 'open') as open_disputes
      FROM contracts
    `;
    const { rows } = await pool.query(query);
    return rows[0];
  },

  getAllUsers: async (limit = 50, offset = 0, search = '', role = null) => {
    let query = `
      SELECT 
        p.id, p.first_name || ' ' || p.last_name as name, p.email, p.role, 
        p.created_at as joined, p.is_banned,
        CASE WHEN p.role = 'expert' THEN e.vetting_status ELSE NULL END as vetting_status,
        CASE WHEN p.role = 'expert' THEN e.expert_status ELSE NULL END as expert_status,
        CASE 
            WHEN p.role = 'expert' THEN (SELECT COALESCE(SUM(released_total), 0) FROM contracts WHERE expert_id = p.id)
            ELSE (SELECT COALESCE(SUM(total_amount), 0) FROM contracts WHERE buyer_id = p.id)
        END as volume
      FROM profiles p
      LEFT JOIN experts e ON p.id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.email ILIKE $${params.length} OR p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length})`;
    }
    if (role && role !== 'all') {
      params.push(role);
      query += ` AND p.role = $${params.length}`;
    }

    query += ` ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    
    const { rows } = await pool.query(query, params);
    return rows;
  },

  getUserById: async (id) => {
    const query = `
      SELECT 
        p.id, p.first_name, p.last_name, p.email, p.role, 
        p.created_at as joined, p.is_banned, p.ban_reason, p.avatar_url,
        e.vetting_status, e.vetting_level, e.experience_summary, e.skills,
        e.expert_status,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        COALESCE(e.patents, '{}') as patents,
        COALESCE(e.papers, '{}') as papers,
        COALESCE(e.products, '{}') as products,
        (SELECT COUNT(*) FROM projects WHERE buyer_id = p.id) as project_count,
        (SELECT COUNT(*) FROM contracts WHERE expert_id = p.id OR buyer_id = p.id) as contract_count,
        CASE 
            WHEN p.role = 'expert' THEN (SELECT COALESCE(SUM(released_total), 0) FROM contracts WHERE expert_id = p.id)
            ELSE (SELECT COALESCE(SUM(total_amount), 0) FROM contracts WHERE buyer_id = p.id)
        END as total_volume
      FROM profiles p
      LEFT JOIN experts e ON p.id = e.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getUserContracts: async (userId) => {
    const query = `
      SELECT 
        c.id, 
        c.total_amount, 
        c.engagement_model, 
        c.status, 
        c.created_at,
        pr.title as project_title
      FROM contracts c
      JOIN projects pr ON c.project_id = pr.id
      WHERE c.buyer_id = $1 OR c.expert_id = $1
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  },

  banUser: async (userId, reason) => {
    const query = `
      UPDATE profiles 
      SET is_banned = true, ban_reason = $2 
      WHERE id = $1 
      RETURNING id, email, is_banned
    `;
    const { rows } = await pool.query(query, [userId, reason]);
    return rows[0];
  },

  unbanUser: async (userId) => {
    const query = `
      UPDATE profiles 
      SET is_banned = false, ban_reason = NULL 
      WHERE id = $1 
      RETURNING id, email, is_banned
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows[0];
  },

  verifyExpert: async (expertId) => {
    const query = `
      UPDATE experts 
      SET vetting_status = 'approved', expert_status = 'verified'
      WHERE id = $1 
      RETURNING id
    `;
    const { rows } = await pool.query(query, [expertId]);
    return rows[0];
  },

  getProjects: async () => {
    const query = `
      SELECT pr.id, pr.title, pr.description, pr.status, pr.created_at,
             COALESCE(p.first_name || ' ' || p.last_name, 'Unknown') as buyer_name
      FROM projects pr
      LEFT JOIN profiles p ON pr.buyer_id = p.id
      ORDER BY pr.created_at DESC LIMIT 20
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  updateProjectStatus: async (projectId, status) => {
    const query = `UPDATE projects SET status = $2 WHERE id = $1 RETURNING id, status`;
    const { rows } = await pool.query(query, [projectId, status]);
    return rows[0];
  },

  getContracts: async () => {
    const query = `
      SELECT id, total_amount, engagement_model, status, created_at, escrow_balance
      FROM contracts ORDER BY created_at DESC LIMIT 20
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  getDisputes: async () => {
    const query = `
      SELECT d.*, 
             c.total_amount as contract_value,
             p_raised.first_name || ' ' || p_raised.last_name as raised_by_name
      FROM disputes d
      JOIN contracts c ON d.contract_id = c.id
      JOIN profiles p_raised ON d.raised_by = p_raised.id
      WHERE d.status = 'open'
      ORDER BY d.created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  resolveDispute: async (disputeId, resolution, adminId, note) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const disputeRes = await client.query('SELECT contract_id, status FROM disputes WHERE id = $1', [disputeId]);
      if (disputeRes.rows.length === 0) throw new Error('Dispute not found');
      const { contract_id } = disputeRes.rows[0];

      const contractRes = await client.query('SELECT escrow_balance FROM contracts WHERE id = $1', [contract_id]);
      const escrowAmount = contractRes.rows[0].escrow_balance;

      if (resolution === 'buyer_wins') {
        await client.query('UPDATE contracts SET escrow_balance = 0, status = "cancelled" WHERE id = $1', [contract_id]);
      } else {
        await client.query('UPDATE contracts SET escrow_balance = 0, released_total = released_total + $2, status = "completed" WHERE id = $1', [contract_id, escrowAmount]);
      }

      const updateDispute = `
        UPDATE disputes 
        SET status = 'resolved', resolved_by = $2, resolution_notes = $3, resolved_at = now()
        WHERE id = $1
        RETURNING id
      `;
      await client.query(updateDispute, [disputeId, adminId, note]);

      await client.query('COMMIT');
      return { success: true, resolution };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  getReports: async () => {
    const query = `
      SELECT r.*, 
             p1.first_name || ' ' || p1.last_name as reporter_name,
             p2.first_name || ' ' || p2.last_name as reported_name
      FROM reports r
      JOIN profiles p1 ON r.reporter_id = p1.id
      JOIN profiles p2 ON r.reported_id = p2.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  updateReportStatus: async (reportId, status, note) => {
    const query = `UPDATE reports SET status = $2, resolution_note = $3 WHERE id = $1 RETURNING id`;
    const { rows } = await pool.query(query, [reportId, status, note]);
    return rows[0];
  },

  getPayouts: async () => {
    const query = `
      SELECT p.*, 
             u.email, 
             pr.first_name || ' ' || pr.last_name as user_name,
             pr.role as user_role
      FROM payouts p
      JOIN auth.users u ON p.user_id = u.id
      JOIN profiles pr ON p.user_id = pr.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  processPayout: async (payoutId) => {
    const query = `
      UPDATE payouts 
      SET status = 'processed', processed_at = now() 
      WHERE id = $1 
      RETURNING id, status
    `;
    const { rows } = await pool.query(query, [payoutId]);
    return rows[0];
  }
};

export default AdminModel;