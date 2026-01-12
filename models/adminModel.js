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
    // Join user_accounts with profiles to get role-specific info
    // Use LEFT JOIN so users without profiles still appear
    // Prefer active profile if exists, otherwise any profile
    let query = `
      SELECT DISTINCT ON (u.id)
        u.id, 
        u.first_name || ' ' || u.last_name as name, 
        u.email, 
        COALESCE(p.profile_type, u.role, 'buyer') as role, 
        u.created_at as joined, 
        u.is_banned,
        CASE 
          WHEN p.profile_type = 'expert' THEN 
            CASE 
              WHEN e.vetting_verified_at IS NOT NULL OR e.expert_status = 'verified' THEN 'approved'
              ELSE 'pending'
            END
          ELSE NULL
        END as vetting_status,
        CASE WHEN p.profile_type = 'expert' THEN e.expert_status ELSE NULL END as expert_status,
        CASE 
            WHEN p.profile_type = 'expert' THEN (SELECT COALESCE(SUM(released_total), 0) FROM contracts WHERE expert_profile_id = p.id)
            ELSE (SELECT COALESCE(SUM(total_amount), 0) FROM contracts WHERE buyer_profile_id = p.id)
        END as volume
      FROM user_accounts u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN experts e ON e.expert_profile_id = p.id
      WHERE 1=1
    `;

    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    if (role && role !== 'all') {
      params.push(role);
      query += ` AND COALESCE(p.profile_type, u.role) = $${params.length}`;
    }

    query += ` ORDER BY u.id, p.is_active DESC NULLS LAST, u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const { rows } = await pool.query(query, params);
    return rows;
  },

  getUserById: async (id) => {
    // id is user_accounts.id
    // Use LEFT JOIN and prefer active profile if exists
    const query = `
      SELECT DISTINCT ON (u.id)
        u.id, u.first_name, u.last_name, u.email, 
        COALESCE(p.profile_type, u.role, 'buyer') as role, p.id as profile_id,
        u.created_at as joined, u.is_banned, u.ban_reason, u.avatar_url,
        CASE 
          WHEN p.profile_type = 'expert' THEN 
            CASE 
              WHEN e.vetting_verified_at IS NOT NULL OR e.expert_status = 'verified' THEN 'approved'
              ELSE 'pending'
            END
          ELSE NULL
        END as vetting_status,
        e.vetting_level, e.experience_summary, e.skills,
        e.expert_status,
        e.avg_daily_rate,
        e.avg_fixed_rate,
        e.avg_sprint_rate,
        ARRAY[]::text[] as patents,
        ARRAY[]::text[] as papers,
        ARRAY[]::text[] as products,
        b.billing_country as location,
        (SELECT COUNT(*) FROM projects pj JOIN profiles pr ON pj.buyer_profile_id = pr.id WHERE pr.user_id = u.id) as project_count,
        (SELECT COUNT(*) FROM contracts ct JOIN profiles pr ON ct.expert_profile_id = pr.id OR ct.buyer_profile_id = pr.id WHERE pr.user_id = u.id) as contract_count,
        CASE 
            WHEN p.profile_type = 'expert' THEN (SELECT COALESCE(SUM(released_total), 0) FROM contracts WHERE expert_profile_id = p.id)
            ELSE (SELECT COALESCE(SUM(total_amount), 0) FROM contracts WHERE buyer_profile_id = p.id)
        END as total_volume
      FROM user_accounts u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN experts e ON e.expert_profile_id = p.id
      LEFT JOIN buyers b ON b.buyer_profile_id = p.id
      WHERE u.id = $1
      ORDER BY u.id, p.is_active DESC NULLS LAST
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  getUserContracts: async (userId) => {
    // userId is user_accounts.id - need to find their profile IDs
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
      JOIN profiles p ON p.user_id = $1
      WHERE c.buyer_profile_id = p.id OR c.expert_profile_id = p.id
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  },

  banUser: async (userId, reason) => {
    // Ban is stored in user_accounts
    const query = `
      UPDATE user_accounts 
      SET is_banned = true, ban_reason = $2 
      WHERE id = $1 
      RETURNING id, email, is_banned
    `;
    const { rows } = await pool.query(query, [userId, reason]);
    return rows[0];
  },

  unbanUser: async (userId) => {
    const query = `
      UPDATE user_accounts 
      SET is_banned = false, ban_reason = NULL 
      WHERE id = $1 
      RETURNING id, email, is_banned
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows[0];
  },

  verifyExpert: async (userId) => {
    // Backwards compatible signature (userId only)
    return AdminModel.verifyExpertByAdmin(userId, null);
  },

  verifyExpertByAdmin: async (userId, adminId) => {
    // userId is user_accounts.id - need to find their expert profile
    const query = `
      UPDATE experts
      SET 
        expert_status = 'verified',
        vetting_verified_at = now(),
        vetting_verified_by = COALESCE($2, vetting_verified_by),
        profile_reviewed_at = now(),
        profile_updated_at = now()
      WHERE expert_profile_id = (
        SELECT p.id FROM profiles p WHERE p.user_id = $1 AND p.profile_type = 'expert'
      )
      RETURNING expert_profile_id as id
    `;
    const { rows } = await pool.query(query, [userId, adminId]);
    return rows[0];
  },

  getProjects: async () => {
    const query = `
      SELECT 
        pr.id,
        pr.title,
        pr.description,
        CASE WHEN pr.status = 'draft' THEN 'pending' ELSE pr.status END as status,
        pr.budget_min,
        pr.budget_max,
        pr.created_at,
        u.id as buyer_id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as buyer_name
      FROM projects pr
      LEFT JOIN profiles p ON pr.buyer_profile_id = p.id
      LEFT JOIN user_accounts u ON p.user_id = u.id
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
      SELECT 
        c.id, c.total_amount, c.engagement_model, c.status, c.created_at, c.escrow_balance,
        c.buyer_profile_id, c.expert_profile_id,
        bp.user_id as buyer_id,
        ep.user_id as expert_id,
        bu.first_name || ' ' || bu.last_name as buyer_name,
        eu.first_name || ' ' || eu.last_name as expert_name
      FROM contracts c
      LEFT JOIN profiles bp ON c.buyer_profile_id = bp.id
      LEFT JOIN profiles ep ON c.expert_profile_id = ep.id
      LEFT JOIN user_accounts bu ON bp.user_id = bu.id
      LEFT JOIN user_accounts eu ON ep.user_id = eu.id
      ORDER BY c.created_at DESC LIMIT 20
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  getDisputes: async () => {
    // raised_by is a profile_id (from disputes table), so we need to join through profiles to get user info
    const query = `
      SELECT d.*, 
             c.total_amount as contract_value,
             u.first_name || ' ' || u.last_name as raised_by_name
      FROM disputes d
      JOIN contracts c ON d.contract_id = c.id
      LEFT JOIN profiles p ON d.raised_by = p.id
      LEFT JOIN user_accounts u ON p.user_id = u.id
      WHERE d.status IN ('open', 'in_review')
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
        await client.query("UPDATE contracts SET escrow_balance = 0, status = 'cancelled' WHERE id = $1", [contract_id]);
      } else {
        await client.query("UPDATE contracts SET escrow_balance = 0, released_total = released_total + $2, status = 'completed' WHERE id = $1", [contract_id, escrowAmount]);
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
    // reporter_id and reported_id reference auth.users (same as user_accounts.id), not profiles
    const query = `
      SELECT r.*, 
             u1.first_name || ' ' || u1.last_name as reporter_name,
             u2.first_name || ' ' || u2.last_name as reported_name
      FROM reports r
      LEFT JOIN user_accounts u1 ON r.reporter_id = u1.id
      LEFT JOIN user_accounts u2 ON r.reported_id = u2.id
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
    // Return empty array - payouts table does not exist yet
    // When payouts feature is implemented, update this function
    try {
      const query = `
        SELECT p.*, 
               u.email, 
               u.first_name || ' ' || u.last_name as user_name,
               pr.profile_type as user_role
        FROM payouts p
        JOIN user_accounts u ON p.user_id = u.id
        JOIN profiles pr ON pr.user_id = u.id AND pr.is_active = true
        ORDER BY p.created_at DESC
        LIMIT 50
      `;
      const { rows } = await pool.query(query);
      return rows;
    } catch (error) {
      // Gracefully handle if payouts table doesn't exist
      console.warn('Payouts table may not exist:', error.message);
      return [];
    }
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