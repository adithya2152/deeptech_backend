import ProfileModel from "../models/profileModel.js";

export const getBuyerById = async (req, res) => {
  try {
    const buyerId = req.params.id;

    const base = await ProfileModel.getBaseProfileById(buyerId);
    if (!base) {
      return res.status(404).json({ message: "Client not found" });
    }

    const buyer = await ProfileModel.getBuyerProfileById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: "Client not found" });
    }

    const reviews = await ProfileModel.getUserReviews(buyerId, 'buyer').catch(() => []);
    const reviewCount = reviews.length;
    const avgRating = reviewCount
      ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviewCount
      : 0;

    // Public-safe payload (do not expose email)
    // Map some buyer fields to the UI-friendly names currently used in ClientPublicProfile.
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
    const buyerId = req.params.id;

    const base = await ProfileModel.getBaseProfileById(buyerId);
    const buyer = await ProfileModel.getBuyerProfileById(buyerId);

    if (!base || !buyer) {
      return res.status(404).json({ message: "Client not found" });
    }

    const projectsPosted = Number(buyer.projects_posted || 0);
    const hiresMade = Number(buyer.hires_made || 0);
    const hireRate = projectsPosted > 0 ? Math.round((hiresMade / projectsPosted) * 100) : 0;

    return res.json({
      data: {
        total_spent: Number(buyer.total_spent || 0),
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
    const buyerId = req.params.id;

    // Get total spent from contracts (escrow_funded_total represents what buyer has paid)
    const pool = (await import('../config/db.js')).default;

    const { rows: spentRows } = await pool.query(`
      SELECT COALESCE(SUM(escrow_funded_total), 0) AS total_spent
      FROM contracts
      WHERE buyer_id = $1
    `, [buyerId]);

    // Count unique experts hired (contracts that reached active or completed status)
    const { rows: hiredRows } = await pool.query(`
      SELECT COUNT(DISTINCT expert_id) AS experts_hired
      FROM contracts
      WHERE buyer_id = $1
        AND status IN ('active', 'completed')
    `, [buyerId]);

    // Count completed projects
    const { rows: completedRows } = await pool.query(`
      SELECT COUNT(*) AS completed_count
      FROM contracts
      WHERE buyer_id = $1
        AND status = 'completed'
    `, [buyerId]);

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
