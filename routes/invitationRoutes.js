import express from 'express';
import { auth } from '../middleware/auth.js';
import { invitationController } from '../controllers/invitationController.js';

const router = express.Router();

router.post('/', auth, invitationController.sendInvitation);
router.get('/me', auth, invitationController.getMyInvitations);
router.patch('/:id/status', auth, invitationController.respondToInvitation);

export default router;