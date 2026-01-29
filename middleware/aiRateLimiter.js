import pool from "../config/db.js";

const MAX_DAILY_USES = 2; // change later if needed

const aiRateLimiter = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const profileId = req.user?.profileId;

        if (!userId || !profileId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized user or profile",
            });
        }

        const today = new Date().toISOString().split("T")[0];

        const result = await pool.query(
            `
  INSERT INTO ai_usage (user_id, profile_id, usage_date, count)
  VALUES ($1, $2, $3, 1)
  ON CONFLICT (user_id, profile_id, usage_date)
  DO UPDATE SET count = ai_usage.count + 1, updated_at = now()
  RETURNING count;
  `,
            [userId, profileId, today]
        );

        const currentCount = result.rows[0].count;

        if (currentCount > MAX_DAILY_USES) {
            return res.status(429).json({
                success: false,
                message: "Daily AI usage limit reached",
                limit: MAX_DAILY_USES,
                used: MAX_DAILY_USES,
            });
        }


        next();
    } catch (err) {
        console.error("AI Rate Limiter Error:", err);
        return res.status(500).json({
            success: false,
            message: "Rate limit check failed",
        });
    }
};

export default aiRateLimiter;
