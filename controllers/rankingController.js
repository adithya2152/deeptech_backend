import pool from "../config/db.js";

export const getUserRank = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });

    const { rows } = await pool.query(
      `SELECT user_id, tier_name, tier_level, achieved_at, previous_tier, badge_icon, tier_description, updated_at
       FROM public.user_rank_tiers
       WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: { user_id: userId, tier_name: "Newcomer", tier_level: 1 },
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("getUserRank error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rank" });
  }
};