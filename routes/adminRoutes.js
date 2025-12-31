import express from 'express';
import adminController from '../controllers/adminController.js';
import { auth as authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, adminController.requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.get('/users/:id/contracts', adminController.getUserContracts);
router.get('/projects', adminController.getProjects);
router.get('/contracts', adminController.getContracts);
router.get('/disputes', adminController.getDisputes);
router.get('/reports', adminController.getReports);
router.get('/payouts', adminController.getPayouts);

router.put('/users/:id/ban', adminController.banUser);
router.put('/users/:id/unban', adminController.unbanUser);
router.put('/users/:id/verify', adminController.verifyExpert);

router.put('/projects/:id/approve', adminController.approveProject);
router.put('/projects/:id/reject', adminController.rejectProject);

router.post('/disputes/:id/resolve', adminController.resolveDispute);

router.post('/reports/:id/action', adminController.actionReport);
router.put('/reports/:id/dismiss', (req, res) => {
    req.body.action = 'dismiss';
    adminController.actionReport(req, res);
});

router.post('/payouts/:id/process', adminController.processPayout);

router.post('/invite', adminController.inviteAdmin);

export default router;