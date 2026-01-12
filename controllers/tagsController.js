import pool from "../config/db.js";

export const getUserTags = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });

    const { rows } = await pool.query(
      `SELECT id, user_id, tag_name, tag_category, tag_icon, description, score_contribution, display_priority, is_verified_badge, awarded_at, expires_at
       FROM public.user_tags
       WHERE user_id = $1
       ORDER BY display_priority ASC NULLS LAST, awarded_at DESC`,
      [userId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getUserTags error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch tags" });
  }
};