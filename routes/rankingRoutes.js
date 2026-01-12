import express from "express";
import { getUserRank } from "../controllers/rankingController.js";

const router = express.Router();

// GET /api/ranking/user/:userId
router.get("/user/:userId", getUserRank);

export default router;