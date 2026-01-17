import pool from "../config/db.js";

export const getUserScore = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId)
            return res
                .status(400)
                .json({ success: false, message: "userId is required" });

        const { rows } = await pool.query(
            `SELECT user_id, expertise_score, performance_score, reliability_score, quality_score, engagement_score, overall_score, last_calculated_at, is_manual_override
       FROM public.user_scores
       WHERE user_id = $1`,
            [userId]
        );

        if (!rows.length) {
            return res.json({
                success: true,
                data: {
                    user_id: userId,
                    expertise_score: 0,
                    performance_score: 0,
                    reliability_score: 0,
                    quality_score: 0,
                    engagement_score: 0,
                    overall_score: 0,
                },
            });
        }

        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error("getUserScore error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch score" });
    }
};

export const getLeaderboard = async (req, res) => {
    try {
        const { limit = 50, role = "expert", sortBy = "score" } = req.query;
        const lim = Math.min(Number(limit) || 50, 200);

        // Determine sort column
        const sortColumn = sortBy === "earnings"
            ? "COALESCE(earnings.total_earned, 0)"
            : "us.overall_score";

        // Left join earnings from PAID invoices for actual money received
        const { rows } = await pool.query(
            `SELECT us.user_id,
              us.overall_score,
              u.first_name,
              u.last_name,
              u.avatar_url,
              rt.tier_name,
              rt.tier_level,
              COALESCE(earnings.total_earned, 0) as total_earned,
              COALESCE(earnings.invoices_paid, 0) as invoices_paid
       FROM public.user_scores us
       JOIN public.user_accounts u ON u.id = us.user_id
       JOIN public.profiles p ON p.user_id = u.id AND p.profile_type = $1
       LEFT JOIN public.user_rank_tiers rt ON rt.user_id = us.user_id
       LEFT JOIN (
         SELECT c.expert_profile_id,
                SUM(i.amount) as total_earned,
                COUNT(DISTINCT i.id) as invoices_paid
         FROM invoices i
         JOIN contracts c ON c.id = i.contract_id
         WHERE i.status = 'paid'
         GROUP BY c.expert_profile_id
       ) earnings ON earnings.expert_profile_id = p.id
       ORDER BY ${sortColumn} DESC NULLS LAST
       LIMIT $2`,
            [role, lim]
        );

        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getLeaderboard error:", err);
        res
            .status(500)
            .json({ success: false, message: "Failed to fetch leaderboard" });
    }
};