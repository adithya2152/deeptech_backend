import express from 'express';
import reportController from '../controllers/reportController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', auth, reportController.createReport);

export default router;