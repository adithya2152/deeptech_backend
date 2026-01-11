import express from "express";
import { getBuyerById, getBuyerStats, getDashboardStats } from "../controllers/buyerController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// Public client (buyer) profile
router.get("/:id", getBuyerById);

// Public client stats
router.get("/:id/stats", getBuyerStats);

// Dashboard stats (authenticated)
router.get("/:id/dashboard-stats", auth, getDashboardStats);

export default router;
