import pool from "../config/db.js";

export const getUserRank = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });

    // Get user's tier info
    const { rows: tierRows } = await pool.query(
      `SELECT user_id, tier_name, tier_level, achieved_at, previous_tier, badge_icon, tier_description, updated_at
       FROM public.user_rank_tiers
       WHERE user_id = $1`,
      [userId]
    );

    // Calculate percentile: what percentage of experts this user is better than
    const { rows: percentileRows } = await pool.query(
      `WITH expert_scores AS (
         SELECT 
           us.user_id,
           COALESCE(us.overall_score, 0) as score
         FROM user_scores us
         JOIN profiles p ON p.user_id = us.user_id
         WHERE p.profile_type = 'expert'
       ),
       ranked AS (
         SELECT 
           user_id,
           score,
           PERCENT_RANK() OVER (ORDER BY score ASC) as percentile
         FROM expert_scores
       )
       SELECT 
         percentile,
         (SELECT COUNT(*) FROM expert_scores) as total_experts,
         (SELECT COUNT(*) FROM expert_scores WHERE score > (SELECT score FROM expert_scores WHERE user_id = $1)) + 1 as rank_position
       FROM ranked
       WHERE user_id = $1`,
      [userId]
    );

    const tierData = tierRows.length > 0
      ? tierRows[0]
      : { user_id: userId, tier_name: "Newcomer", tier_level: 1 };

    // percentile is 0-1, we want "Top X%" so we do (1 - percentile) * 100
    const percentileData = percentileRows.length > 0 ? percentileRows[0] : null;
    const topPercentile = percentileData
      ? Math.max(1, Math.round((1 - parseFloat(percentileData.percentile)) * 100))
      : 100; // Default to 100% (bottom) if no data

    return res.json({
      success: true,
      data: {
        ...tierData,
        top_percentile: topPercentile,
        total_experts: percentileData?.total_experts || 0,
        rank_position: percentileData?.rank_position || null
      }
    });
  } catch (err) {
    console.error("getUserRank error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rank" });
  }
};