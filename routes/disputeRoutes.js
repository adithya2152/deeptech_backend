import express from 'express';
import disputeController from '../controllers/disputeController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', auth, disputeController.createDispute);

export default router;