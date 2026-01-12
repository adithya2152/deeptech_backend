import express from "express";
import {
  getUserScore,
  getLeaderboard,
} from "../controllers/scoringController.js";

const router = express.Router();

// GET /api/scoring/user/:userId
router.get("/user/:userId", getUserScore);

// GET /api/scoring/leaderboard?limit=50&role=expert
router.get("/leaderboard", getLeaderboard);

export default router;