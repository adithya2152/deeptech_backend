import pool from "../config/db.js";

const AdminModel = {
  getStats: async () => {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM user_accounts) as total_users,
        (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.status = 'paid') as total_revenue,
        (SELECT COUNT(*) FROM projects WHERE status IN ('active', 'in_progress')) as active_projects,
        (SELECT COUNT(*) FROM contracts WHERE status = 'active') as active_contracts,
        (SELECT COUNT(*) FROM disputes WHERE status = 'open') as open_disputes
    `;
    const { rows } = await pool.query(query);
    return rows[0];
  },

  getAllUsers: async (limit = 50, offset = 0, search = '', role = null) => {
    // A single user_accounts row can have multiple profiles (buyer + expert).
    // For governance actions (ban/unban/etc), we want one row per user_id.
    // Return roles[] so the UI can render multiple badges.
    let query = `
      WITH profiles_ranked AS (
        SELECT
          p.*, 
          ROW_NUMBER() OVER (
            PARTITION BY p.user_id, p.profile_type
            ORDER BY p.is_active DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id DESC
          ) AS rn
        FROM profiles p
      ),
      expert_profile AS (
        SELECT user_id, id AS expert_profile_id
        FROM profiles_ranked
        WHERE profile_type = 'expert' AND rn = 1
      ),
      buyer_profile AS (
        SELECT user_id, id AS buyer_profile_id
        FROM profiles_ranked
        WHERE profile_type = 'buyer' AND rn = 1
      )
      SELECT
        u.id,
        u.first_name || ' ' || u.last_name as name,
        u.email,
        CASE
          WHEN u.role = 'admin' THEN 'admin'
          WHEN ep.expert_profile_id IS NOT NULL THEN 'expert'
          WHEN bp.buyer_profile_id IS NOT NULL THEN 'buyer'
          ELSE COALESCE(u.role, 'buyer')
        END as role,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN u.role = 'admin' THEN 'admin' END,
          CASE WHEN ep.expert_profile_id IS NOT NULL THEN 'expert' END,
          CASE WHEN bp.buyer_profile_id IS NOT NULL THEN 'buyer' END
        ], NULL) as roles,
        u.created_at as joined,
        u.last_login,
        u.is_banned,
        CASE
          WHEN ep.expert_profile_id IS NOT NULL THEN
            CASE
              WHEN e.vetting_verified_at IS NOT NULL OR e.expert_status = 'verified' THEN 'approved'
              ELSE 'pending'
            END
          ELSE NULL
        END as vetting_status,
        CASE WHEN ep.expert_profile_id IS NOT NULL THEN e.expert_status ELSE NULL END as expert_status,
        (
          SELECT COALESCE(SUM(i.amount), 0)
          FROM invoices i
          WHERE i.status = 'paid'
            AND (
              i.expert_profile_id IN (SELECT id FROM profiles WHERE user_id = u.id)
              OR i.buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = u.id)
            )
        ) as volume
      FROM user_accounts u
      LEFT JOIN expert_profile ep ON ep.user_id = u.id
      LEFT JOIN buyer_profile bp ON bp.user_id = u.id
      LEFT JOIN experts e ON e.expert_profile_id = ep.expert_profile_id
      WHERE 1=1
    `;

    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    if (role && role !== 'all') {
      params.push(role);
      query += ` AND (
        ($${params.length} = 'admin' AND u.role = 'admin')
        OR ($${params.length} = 'expert' AND ep.expert_profile_id IS NOT NULL)
        OR ($${params.length} = 'buyer' AND bp.buyer_profile_id IS NOT NULL)
      )`;
    }

    query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const { rows } = await pool.query(query, params);
    return rows;
  },

  getUserById: async (id) => {
    // id is user_accounts.id
    // A user can have multiple profiles; prefer expert/buyer specifics from their respective profiles.
    const query = `
      WITH profiles_ranked AS (
        SELECT
          p.*, 
          ROW_NUMBER() OVER (
            PARTITION BY p.user_id, p.profile_type
            ORDER BY p.is_active DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id DESC
          ) AS rn
        FROM profiles p
      ),
      expert_profile AS (
        SELECT user_id, id AS expert_profile_id
        FROM profiles_ranked
        WHERE profile_type = 'expert' AND rn = 1
      ),
      buyer_profile AS (
        SELECT user_id, id AS buyer_profile_id
        FROM profiles_ranked
        WHERE profile_type = 'buyer' AND rn = 1
      )
      SELECT
        u.id, u.first_name, u.last_name, u.email,
        CASE
          WHEN u.role = 'admin' THEN 'admin'
          WHEN ep.expert_profile_id IS NOT NULL THEN 'expert'
          WHEN bp.buyer_profile_id IS NOT NULL THEN 'buyer'
          ELSE COALESCE(u.role, 'buyer')
        END as role,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN u.role = 'admin' THEN 'admin' END,
          CASE WHEN ep.expert_profile_id IS NOT NULL THEN 'expert' END,
          CASE WHEN bp.buyer_profile_id IS NOT NULL THEN 'buyer' END
        ], NULL) as roles,
        COALESCE(ep.expert_profile_id, bp.buyer_profile_id) as profile_id,
        ep.expert_profile_id,
        bp.buyer_profile_id,
        u.created_at as joined, u.is_banned, u.ban_reason, u.avatar_url,
        u.last_login,
        CASE 
          WHEN ep.expert_profile_id IS NOT NULL THEN 
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
        COALESCE((
          SELECT json_agg(doc)
          FROM (
            SELECT json_build_object(
              'id', d.id,
              'document_type', d.document_type,
              'title', d.title,
              'url', d.url,
              'is_public', d.is_public,
              'created_at', d.created_at,
              'sub_type', d.sub_type
            ) AS doc
            FROM expert_documents d
            WHERE (d.expert_profile_id = ep.expert_profile_id OR d.expert_id = u.id)
            ORDER BY d.created_at DESC
          ) docs
        ), '[]'::json) as expert_documents,
        COALESCE(us.expertise_score, 0) as expertise_score,
        COALESCE(us.performance_score, 0) as performance_score,
        COALESCE(us.reliability_score, 0) as reliability_score,
        COALESCE(us.quality_score, 0) as quality_score,
        COALESCE(us.engagement_score, 0) as engagement_score,
        COALESCE(us.overall_score, 0) as overall_score,
        ARRAY[]::text[] as patents,
        ARRAY[]::text[] as papers,
        ARRAY[]::text[] as products,
        b.billing_country as location,
        (SELECT COUNT(*) FROM projects pj JOIN profiles pr ON pj.buyer_profile_id = pr.id WHERE pr.user_id = u.id) as project_count,
        (SELECT COUNT(*) FROM contracts ct JOIN profiles pr ON ct.expert_profile_id = pr.id OR ct.buyer_profile_id = pr.id WHERE pr.user_id = u.id) as contract_count,
        (
          SELECT COALESCE(SUM(i.amount), 0)
          FROM invoices i
          WHERE i.status = 'paid'
            AND (
              i.expert_profile_id IN (SELECT id FROM profiles WHERE user_id = u.id)
              OR i.buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = u.id)
            )
        ) as total_volume
      FROM user_accounts u
      LEFT JOIN expert_profile ep ON ep.user_id = u.id
      LEFT JOIN buyer_profile bp ON bp.user_id = u.id
      LEFT JOIN experts e ON e.expert_profile_id = ep.expert_profile_id
      LEFT JOIN buyers b ON b.buyer_profile_id = bp.buyer_profile_id
      LEFT JOIN user_scores us ON us.user_id = u.id
      WHERE u.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  updateExpertAdminFields: async (userId, { expert_status = null, vetting_level = null } = {}) => {
    if (!expert_status && !vetting_level) {
      throw new Error('No expert fields provided');
    }

    const set = [];
    const params = [userId];

    if (expert_status) {
      params.push(expert_status);
      set.push(`expert_status = $${params.length}`);
      if (expert_status === 'verified') {
        set.push(`vetting_verified_at = now()`);
      }
      set.push(`profile_reviewed_at = now()`);
      set.push(`profile_updated_at = now()`);
    }

    if (vetting_level) {
      params.push(vetting_level);
      set.push(`vetting_level = $${params.length}`);
    }

    const query = `
      UPDATE experts
      SET ${set.join(', ')}
      WHERE expert_profile_id = (
        SELECT p.id FROM profiles p WHERE p.user_id = $1 AND p.profile_type = 'expert'
      )
      RETURNING expert_profile_id as expert_profile_id, expert_status, vetting_level
    `;

    const { rows } = await pool.query(query, params);
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
        pr.status,
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
      ORDER BY (CASE WHEN d.status IN ('open', 'in_review') THEN 0 ELSE 1 END), d.created_at DESC
      LIMIT 200
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

  closeDispute: async (disputeId, adminId, note) => {
    const query = `
      UPDATE disputes
      SET status = 'closed',
          resolved_by = $2,
          resolution_notes = COALESCE($3, resolution_notes),
          resolved_at = now(),
          updated_at = now()
      WHERE id = $1
        AND status IN ('open', 'in_review')
      RETURNING id
    `;
    const { rows } = await pool.query(query, [disputeId, adminId, note || null]);
    return rows[0];
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

  getInvoices: async ({ status = null, limit = 100 } = {}) => {
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE i.status = $${params.length}`;
    }

    const query = `
      SELECT
        i.id,
        i.contract_id,
        i.amount,
        i.total_hours,
        i.status,
        i.invoice_type,
        i.week_start_date,
        i.week_end_date,
        i.created_at,
        i.updated_at,
        prj.id as project_id,
        prj.title as project_title,
        bu.id as buyer_user_id,
        bu.email as buyer_email,
        COALESCE(bu.first_name || ' ' || bu.last_name, bu.email) as buyer_name,
        eu.id as expert_user_id,
        eu.email as expert_email,
        COALESCE(eu.first_name || ' ' || eu.last_name, eu.email) as expert_name
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      LEFT JOIN projects prj ON c.project_id = prj.id
      LEFT JOIN profiles bp ON i.buyer_profile_id = bp.id
      LEFT JOIN user_accounts bu ON bp.user_id = bu.id
      LEFT JOIN profiles ep ON i.expert_profile_id = ep.id
      LEFT JOIN user_accounts eu ON ep.user_id = eu.id
      ${where}
      ORDER BY i.updated_at DESC
      LIMIT ${Number(limit) || 100}
    `;

    const { rows } = await pool.query(query, params);
    return rows;
  },

  getEarningsAnalytics: async ({
    limitCountries = 10,
    limitExperts = 10,
    limitDomains = 0,
    limitCountryUsers = 0,
  } = {}) => {
    // Keep in sync with frontend/src/lib/constants.ts domainLabels keys.
    const ALLOWED_DOMAIN_KEYS = [
      'ai_ml',
      'robotics',
      'climate_tech',
      'biotech',
      'quantum',
      'space_tech',
      'advanced_materials',
      'energy',
      'infrastructure',
    ];

    const paidTotalsQuery = `
      SELECT
        COUNT(*)::int as paid_invoices_count,
        COALESCE(SUM(i.amount), 0)::numeric as paid_amount_total,
        COALESCE(AVG(i.amount), 0)::numeric as avg_paid_invoice_amount,
        COUNT(DISTINCT i.expert_profile_id)::int as unique_experts_paid,
        COUNT(DISTINCT i.buyer_profile_id)::int as unique_buyers_paid
      FROM invoices i
      WHERE i.status = 'paid'
    `;

    const topCountriesQuery = `
      SELECT
        COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown') as country,
        COALESCE(SUM(i.amount), 0)::numeric as paid_amount,
        COUNT(*)::int as paid_invoices_count,
        COUNT(DISTINCT i.expert_profile_id)::int as unique_experts
      FROM invoices i
      JOIN profiles p ON p.id = i.expert_profile_id
      JOIN user_accounts u ON u.id = p.user_id
      WHERE i.status = 'paid'
      GROUP BY COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown')
      ORDER BY COALESCE(SUM(i.amount), 0) DESC
      LIMIT $1
    `;

    const topExpertsQuery = `
      SELECT
        p.id as expert_profile_id,
        u.id as expert_user_id,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as expert_name,
        COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown') as country,
        COALESCE(e.skills, '{}'::text[]) as skills,
        COALESCE(SUM(i.amount), 0)::numeric as paid_amount,
        COUNT(*)::int as paid_invoices_count
      FROM invoices i
      JOIN profiles p ON p.id = i.expert_profile_id
      JOIN user_accounts u ON u.id = p.user_id
      LEFT JOIN experts e ON e.expert_profile_id = p.id
      WHERE i.status = 'paid'
      GROUP BY p.id, u.id, u.first_name, u.last_name, u.email, u.country, e.skills
      ORDER BY COALESCE(SUM(i.amount), 0) DESC
      LIMIT $1
    `;

    // Top domains by contract activity.
    // Note: if an expert lists multiple domains, each contract is attributed to each of those domains.
    const topDomainsByContractsQuery = `
      WITH expert_domains AS (
        SELECT
          p.id as expert_profile_id,
          u.id as expert_user_id,
          LOWER(TRIM(domain)) as domain
        FROM profiles p
        JOIN user_accounts u ON u.id = p.user_id
        JOIN experts e ON e.expert_profile_id = p.id
        CROSS JOIN LATERAL unnest(COALESCE(e.domains, '{}'::text[])) domain
        WHERE p.profile_type = 'expert'
          AND TRIM(COALESCE(domain, '')) <> ''
          AND LOWER(TRIM(domain)) = ANY($1::text[])
      )
      SELECT
        ed.domain,
        COUNT(DISTINCT ed.expert_user_id)::int as experts_count,
        COUNT(c.id)::int as contracts_count,
        COUNT(c.id) FILTER (WHERE c.status IN ('active', 'paused'))::int as active_contracts_count
      FROM expert_domains ed
      LEFT JOIN contracts c ON c.expert_profile_id = ed.expert_profile_id
      GROUP BY ed.domain
      ORDER BY COUNT(c.id) DESC, COUNT(c.id) FILTER (WHERE c.status IN ('active', 'paused')) DESC, COUNT(DISTINCT ed.expert_user_id) DESC, ed.domain ASC
      LIMIT $2
    `;

    // Country breakdown across experts (user_accounts.country) and buyers (buyers.billing_country).
    const countryUserCountsQuery = `
      WITH expert_counts AS (
        SELECT
          COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown') as country,
          COUNT(DISTINCT u.id)::int as experts_count
        FROM user_accounts u
        JOIN profiles p ON p.user_id = u.id
        WHERE p.profile_type = 'expert'
        GROUP BY COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown')
      ),
      buyer_counts AS (
        SELECT
          COALESCE(NULLIF(TRIM(b.billing_country), ''), 'Unknown') as country,
          COUNT(DISTINCT u.id)::int as buyers_count
        FROM buyers b
        JOIN profiles p ON p.id = b.buyer_profile_id
        JOIN user_accounts u ON u.id = p.user_id
        GROUP BY COALESCE(NULLIF(TRIM(b.billing_country), ''), 'Unknown')
      )
      SELECT
        COALESCE(e.country, b.country) as country,
        COALESCE(e.experts_count, 0)::int as experts_count,
        COALESCE(b.buyers_count, 0)::int as buyers_count,
        (COALESCE(e.experts_count, 0) + COALESCE(b.buyers_count, 0))::int as total_users
      FROM expert_counts e
      FULL OUTER JOIN buyer_counts b ON LOWER(e.country) = LOWER(b.country)
      ORDER BY total_users DESC, country ASC
      LIMIT $1
    `;

    const [totalsRes, countriesRes, expertsRes, domainsRes, countryUsersRes] = await Promise.all([
      pool.query(paidTotalsQuery),
      pool.query(topCountriesQuery, [Number(limitCountries) || 10]),
      pool.query(topExpertsQuery, [Number(limitExperts) || 10]),
      Number(limitDomains) > 0
        ? pool.query(topDomainsByContractsQuery, [ALLOWED_DOMAIN_KEYS, Number(limitDomains) || 10])
        : Promise.resolve({ rows: [] }),
      Number(limitCountryUsers) > 0
        ? pool.query(countryUserCountsQuery, [Number(limitCountryUsers) || 250])
        : Promise.resolve({ rows: [] }),
    ]);

    const totals = totalsRes.rows[0] || {
      paid_invoices_count: 0,
      paid_amount_total: 0,
      avg_paid_invoice_amount: 0,
      unique_experts_paid: 0,
      unique_buyers_paid: 0,
    };

    const topCountries = countriesRes.rows || [];
    const topExperts = expertsRes.rows || [];
    const topDomains = domainsRes.rows || [];
    const countryUserCounts = countryUsersRes.rows || [];

    return {
      totals: {
        paid_invoices_count: Number(totals.paid_invoices_count || 0),
        paid_amount_total: Number(totals.paid_amount_total || 0),
        avg_paid_invoice_amount: Number(totals.avg_paid_invoice_amount || 0),
        unique_experts_paid: Number(totals.unique_experts_paid || 0),
        unique_buyers_paid: Number(totals.unique_buyers_paid || 0),
      },
      top_countries: topCountries.map((r) => ({
        country: r.country,
        paid_amount: Number(r.paid_amount || 0),
        paid_invoices_count: Number(r.paid_invoices_count || 0),
        unique_experts: Number(r.unique_experts || 0),
      })),
      top_experts: topExperts.map((r) => ({
        expert_profile_id: r.expert_profile_id,
        expert_user_id: r.expert_user_id,
        expert_name: r.expert_name,
        country: r.country,
        skills: r.skills || [],
        paid_amount: Number(r.paid_amount || 0),
        paid_invoices_count: Number(r.paid_invoices_count || 0),
      })),
      top_domains: topDomains.map((r) => ({
        domain: r.domain,
        experts_count: Number(r.experts_count || 0),
        contracts_count: Number(r.contracts_count || 0),
        active_contracts_count: Number(r.active_contracts_count || 0),
      })),
      country_user_counts: countryUserCounts.map((r) => ({
        country: r.country,
        experts_count: Number(r.experts_count || 0),
        buyers_count: Number(r.buyers_count || 0),
        total_users: Number(r.total_users || 0),
      })),
      highest_earner: topExperts.length ? {
        expert_profile_id: topExperts[0].expert_profile_id,
        expert_user_id: topExperts[0].expert_user_id,
        expert_name: topExperts[0].expert_name,
        country: topExperts[0].country,
        skills: topExperts[0].skills || [],
        paid_amount: Number(topExperts[0].paid_amount || 0),
        paid_invoices_count: Number(topExperts[0].paid_invoices_count || 0),
      } : null,
      top_geography: topCountries.length ? {
        country: topCountries[0].country,
        paid_amount: Number(topCountries[0].paid_amount || 0),
        paid_invoices_count: Number(topCountries[0].paid_invoices_count || 0),
        unique_experts: Number(topCountries[0].unique_experts || 0),
      } : null,
    };
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