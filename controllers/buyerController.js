import ProfileModel from "../models/profileModel.js";
import pool from "../config/db.js";

export const getBuyerById = async (req, res) => {
  try {
    const id = req.params.id;

    // Validate id
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ message: "Valid client ID is required" });
    }

    // First try to get by profile_id directly
    let buyer = await ProfileModel.getBuyerByProfileId(id);
    let base = null;

    if (buyer) {
      // Got buyer via profile_id, base data is already merged
      base = buyer;
    } else {
      // Try as user_id (legacy support)
      base = await ProfileModel.getBaseProfileById(id);
      if (!base) {
        return res.status(404).json({ message: "Client not found" });
      }
      buyer = await ProfileModel.getBuyerProfileById(id);
      if (!buyer) {
        return res.status(404).json({ message: "Client not found" });
      }
    }

    const userId = base.user_id || base.id;
    const reviews = await ProfileModel.getUserReviews(userId, 'buyer').catch(() => []);
    const reviewCount = reviews.length;
    const avgRating = reviewCount
      ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviewCount
      : 0;

    // Public-safe payload (do not expose email)
    const {
      email: _email,
      ...safeBase
    } = base;

    return res.json({
      data: {
        ...safeBase,
        ...buyer,
        location: safeBase.country || null,
        rating: Number(avgRating.toFixed(2)),
        review_count: reviewCount,
        verified_email: !!safeBase.email_verified,
        verified_identity: !!buyer.verified,
        verified_payment: !!buyer.verified,
      },
    });
  } catch (err) {
    console.error("getBuyerById error", err);
    return res.status(500).json({ message: "Failed to load client" });
  }
};

export const getBuyerStats = async (req, res) => {
  try {
    const id = req.params.id;

    // Try profile_id first, then user_id
    let buyer = await ProfileModel.getBuyerByProfileId(id);
    let base = buyer;
    let buyerProfileId = id;

    if (!buyer) {
      base = await ProfileModel.getBaseProfileById(id);
      buyer = await ProfileModel.getBuyerProfileById(id);

      // Id was a user_id, get the buyer profile id
      const { rows: profileRows } = await pool.query(
        `SELECT id FROM profiles WHERE user_id = $1 AND profile_type = 'buyer' LIMIT 1`,
        [id]
      );
      if (profileRows.length > 0) {
        buyerProfileId = profileRows[0].id;
      }
    } else {
      // buyer was found by profile_id, use that
      buyerProfileId = buyer.buyer_profile_id || id;
    }

    if (!base || !buyer) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Calculate total_spent from paid invoices (accurate, not stale)
    const { rows: spentRows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_spent
      FROM invoices
      WHERE buyer_profile_id = $1
        AND status = 'paid'
    `, [buyerProfileId]);

    // Calculate projects posted from actual projects table
    const { rows: projectRows } = await pool.query(`
      SELECT COUNT(*) AS count FROM projects WHERE buyer_profile_id = $1
    `, [buyerProfileId]);
    const projectsPosted = parseInt(projectRows[0].count) || 0;

    // Calculate hires made from contracts that reached active/completed status
    const { rows: hireRows } = await pool.query(`
      SELECT COUNT(DISTINCT expert_profile_id) AS count
      FROM contracts
      WHERE buyer_profile_id = $1
        AND status IN ('active', 'completed')
    `, [buyerProfileId]);
    const hiresMade = parseInt(hireRows[0].count) || 0;

    // Cap hire rate at 100%
    const hireRate = projectsPosted > 0 ? Math.min(100, Math.round((hiresMade / projectsPosted) * 100)) : 0;

    return res.json({
      data: {
        total_spent: parseFloat(spentRows[0].total_spent) || 0,
        hire_rate: hireRate,
        jobs_posted_count: projectsPosted,
        avg_hourly_rate: 0,
        hours_billed: 0,
        member_since: base.created_at,
      },
    });
  } catch (err) {
    console.error("getBuyerStats error", err);
    return res.status(500).json({ message: "Failed to load client stats" });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const id = req.params.id;

    // Determine if this is a profile_id or user_id and get the buyer_profile_id
    let buyerProfileId = id;

    // Check if it's a user_id by looking up the active buyer profile
    const { rows: profileRows } = await pool.query(
      `SELECT id FROM profiles WHERE user_id = $1 AND profile_type = 'buyer' LIMIT 1`,
      [id]
    );
    if (profileRows.length > 0) {
      buyerProfileId = profileRows[0].id;
    }

    // Get total spent from invoices (only paid ones)
    const { rows: spentRows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_spent
      FROM invoices
      WHERE buyer_profile_id = $1
        AND status = 'paid'
    `, [buyerProfileId]);

    // Count unique experts hired (contracts that reached active or completed status)
    const { rows: hiredRows } = await pool.query(`
      SELECT COUNT(DISTINCT expert_profile_id) AS experts_hired
      FROM contracts
      WHERE buyer_profile_id = $1
        AND status IN ('active', 'completed')
    `, [buyerProfileId]);

    // Count completed projects
    const { rows: completedRows } = await pool.query(`
      SELECT COUNT(*) AS completed_count
      FROM contracts
      WHERE buyer_profile_id = $1
        AND status = 'completed'
    `, [buyerProfileId]);

    return res.json({
      success: true,
      data: {
        totalSpent: parseFloat(spentRows[0].total_spent) || 0,
        expertsHired: parseInt(hiredRows[0].experts_hired) || 0,
        completedProjects: parseInt(completedRows[0].completed_count) || 0
      }
    });
  } catch (err) {
    console.error("getDashboardStats error", err);
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};
