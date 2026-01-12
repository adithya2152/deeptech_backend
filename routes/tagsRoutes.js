import express from "express";
import { getUserTags } from "../controllers/tagsController.js";

const router = express.Router();

// GET /api/tags/user/:userId
router.get("/user/:userId", getUserTags);

export default router;