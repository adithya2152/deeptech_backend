import express from "express";
import axios from "axios";
import { auth } from "../middleware/auth.js";
import aiRateLimiter from "../middleware/aiRateLimiter.js";

const router = express.Router();

router.post(
  "/analyze-existing",
  auth,           // ✅ your auth middleware
  aiRateLimiter,  // ✅ rate limit
  async (req, res) => {
    try {
      const response = await axios.post(
        process.env.PYTHON_SEMANTIC_SEARCH_URL + "/analyze-existing",
        req.body,
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );

      return res.json(response.data);
    } catch (err) {
      console.error("FastAPI Error:", err.response?.data || err.message);

      return res.status(500).json({
        success: false,
        message: "AI service failed",
      });
    }
  }
);

export default router;
