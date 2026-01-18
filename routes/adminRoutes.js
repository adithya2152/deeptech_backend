import express from 'express';
import adminController from '../controllers/adminController.js';
import { auth as authenticateToken } from '../middleware/auth.js';
import pool from '../config/db.js'; // 1. ADD THIS IMPORT

const router = express.Router();

router.use(authenticateToken, adminController.requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.get('/users/:id/contracts', adminController.getUserContracts);
router.get('/users/:id/projects', adminController.getUserProjects);
router.get('/profiles/:profileId/contracts', adminController.getProfileContracts);
router.get('/projects', adminController.getProjects);
router.get('/contracts', adminController.getContracts);
router.get('/disputes', adminController.getDisputes);
router.get('/reports', adminController.getReports);
router.get('/documents/:id/signed-url', adminController.getDocumentSignedUrl);
router.get('/payouts', adminController.getPayouts);
router.get('/invoices', adminController.getInvoices);
router.get('/analytics/earnings', adminController.getEarningsAnalytics);
router.get('/analytics/circumvention', adminController.getCircumventionAnalytics);

router.put('/users/:id/ban', adminController.banUser);
router.put('/users/:id/unban', adminController.unbanUser);
router.put('/users/:id/verify', adminController.verifyExpert);
router.put('/users/:id/expert-status', adminController.updateExpertStatus);

router.put('/projects/:id/approve', adminController.approveProject);
router.put('/projects/:id/reject', adminController.rejectProject);

router.post('/disputes/:id/resolve', adminController.resolveDispute);
router.post('/disputes/:id/close', adminController.closeDispute);

router.post('/reports/:id/action', adminController.actionReport);
router.put('/reports/:id/dismiss', (req, res) => {
    req.body.action = 'dismiss';
    adminController.actionReport(req, res);
});

router.post('/payouts/:id/process', adminController.processPayout);

router.post('/invite', adminController.inviteAdmin);

// REPLACE the existing router.get("/users/:id/ai-evaluation"...) block with this:

router.get("/users/:id/ai-evaluation", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT e.*
      FROM expert_ai_evaluations e
      JOIN profiles p ON e.expert_profile_id = p.id
      WHERE 
        p.user_id = $1              -- 1. Check if ID matches a User ID (Your case)
        OR e.expert_profile_id = $1 -- 2. Check if ID matches a Profile ID (Direct link case)
      ORDER BY e.created_at DESC
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("AI evaluation fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch AI evaluation",
    });
  }
});

export default router;