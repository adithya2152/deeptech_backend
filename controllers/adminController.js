import AdminModel from "../models/adminModel.js";
import pool from "../config/db.js";
import jwt from 'jsonwebtoken';
import { sendEmail } from '../services/mailer.js';

export const requireAdmin = async (req, res, next) => {
  try {
    // First check JWT role
    if (req.user?.role === 'admin') {
      return next();
    }

    const userId = req.user?.id;
    if (userId) {
      const { rows } = await pool.query(
        'SELECT role FROM user_accounts WHERE id = $1',
        [userId]
      );

      if (rows.length > 0 && rows[0].role === 'admin') {
        return next();
      }
    }

    return res.status(403).json({ success: false, message: 'Admin access required' });
  } catch (error) {
    console.error('[requireAdmin] Error:', error);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

export const getStats = async (req, res) => {
  try {
    const stats = await AdminModel.getStats();
    res.json({
      success: true, data: {
        totalUsers: parseInt(stats.total_users),
        totalRevenue: parseFloat(stats.total_revenue),
        activeProjects: parseInt(stats.active_projects),
        activeContracts: parseInt(stats.active_contracts),
        openDisputes: parseInt(stats.open_disputes)
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getUsers = async (req, res) => {
  try {
    const { search, role } = req.query;
    const users = await AdminModel.getAllUsers(50, 0, search, role);
    res.json({ success: true, data: users });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await AdminModel.getUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getUserContracts = async (req, res) => {
  try {
    const { id } = req.params;
    const contracts = await AdminModel.getUserContracts(id);
    res.json({ success: true, data: contracts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getProjects = async (req, res) => {
  try {
    const projects = await AdminModel.getProjects();
    res.json({ success: true, data: projects });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getContracts = async (req, res) => {
  try {
    const contracts = await AdminModel.getContracts();
    res.json({ success: true, data: contracts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getDisputes = async (req, res) => {
  try {
    const disputes = await AdminModel.getDisputes();
    res.json({ success: true, data: disputes });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getReports = async (req, res) => {
  try {
    const reports = await AdminModel.getReports();
    res.json({ success: true, data: reports });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getPayouts = async (req, res) => {
  try {
    const payouts = await AdminModel.getPayouts();
    res.json({ success: true, data: payouts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getInvoices = async (req, res) => {
  try {
    const { status } = req.query;
    const invoices = await AdminModel.getInvoices({ status: status || null });
    res.json({ success: true, data: invoices });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const getEarningsAnalytics = async (req, res) => {
  try {
    const { limitCountries, limitExperts, limitDomains, limitCountryUsers } = req.query;
    const data = await AdminModel.getEarningsAnalytics({
      limitCountries: limitCountries ? Number(limitCountries) : 10,
      limitExperts: limitExperts ? Number(limitExperts) : 10,
      limitDomains: limitDomains ? Number(limitDomains) : 0,
      limitCountryUsers: limitCountryUsers ? Number(limitCountryUsers) : 0,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const updated = await AdminModel.banUser(id, reason);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User banned successfully' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await AdminModel.unbanUser(id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User unbanned successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
};

export const verifyExpert = async (req, res) => {
  try {
    const { id } = req.params;
    await AdminModel.verifyExpertByAdmin(id, req.user?.id || null);
    res.json({ success: true, message: 'Expert verified successfully' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const updateExpertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { expert_status, vetting_level } = req.body || {};

    const allowedExpertStatuses = new Set(['incomplete', 'pending_review', 'rookie', 'verified', 'rejected']);
    const allowedVettingLevels = new Set(['general', 'advanced', 'deep_tech_verified']);

    if (expert_status && !allowedExpertStatuses.has(expert_status)) {
      return res.status(400).json({ success: false, message: 'Invalid expert_status' });
    }
    if (vetting_level && !allowedVettingLevels.has(vetting_level)) {
      return res.status(400).json({ success: false, message: 'Invalid vetting_level' });
    }

    const updated = await AdminModel.updateExpertAdminFields(id, { expert_status: expert_status || null, vetting_level: vetting_level || null });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Expert profile not found for this user' });
    }

    res.json({ success: true, message: 'Expert updated successfully', data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const approveProject = async (req, res) => {
  try {
    await AdminModel.updateProjectStatus(req.params.id, 'active');
    res.json({ success: true, message: 'Project approved' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const rejectProject = async (req, res) => {
  try {
    const { id } = req.params;
    await AdminModel.updateProjectStatus(id, 'rejected');
    res.json({ success: true, message: 'Project rejected' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, note } = req.body;
    await AdminModel.resolveDispute(id, decision, req.user.id, note);
    res.json({ success: true, message: 'Dispute resolved successfully' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const closeDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    const updated = await AdminModel.closeDispute(id, req.user.id, note);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Dispute not found or not closable' });
    }

    res.json({ success: true, message: 'Dispute closed successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const actionReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (action === 'dismiss') {
      await AdminModel.updateReportStatus(id, 'dismissed', 'Admin dismissed report');
    } else if (action === 'ban') {
      // "Ban" should actually ban the reported user, not just mark the report resolved.
      const { rows } = await pool.query('SELECT reported_id FROM reports WHERE id = $1', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Report not found' });
      }
      const reportedUserId = rows[0].reported_id;
      await AdminModel.banUser(reportedUserId, 'Banned by admin (report action)');
      await AdminModel.updateReportStatus(id, 'resolved', 'User banned');
    } else {
      await AdminModel.updateReportStatus(id, 'resolved', `Action taken: ${action}`);
    }
    res.json({ success: true, message: 'Report action taken' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const processPayout = async (req, res) => {
  try {
    const { id } = req.params;
    await AdminModel.processPayout(id);
    res.json({ success: true, message: 'Payout processed successfully' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const inviteAdmin = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    // Only invite existing users for now.
    const { rows } = await pool.query('SELECT id, email FROM user_accounts WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Ask them to register first, then invite again.',
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET not configured' });
    }

    const inviteToken = jwt.sign(
      {
        type: 'admin_invite',
        email,
        invitedBy: req.user?.id || null,
      },
      jwtSecret,
      { expiresIn: process.env.ADMIN_INVITE_EXPIRY || '7d' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteLink = `${frontendUrl}/login?adminInvite=${encodeURIComponent(inviteToken)}`;

    const mailResult = await sendEmail({
      to: email,
      subject: 'DeepTech Admin Invitation',
      text: `You have been invited to become an admin on DeepTech.\n\n1) Click this link: ${inviteLink}\n2) Log in with your existing account\n3) Your role will be upgraded to admin\n`,
    });

    res.json({
      success: true,
      message: 'Admin invitation created',
      data: {
        email,
        inviteLink,
        emailSent: mailResult.sent,
      },
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export default {
  requireAdmin,
  getStats, getUsers, getUserById, getUserContracts, getProjects, getContracts, getDisputes, getReports, getPayouts, getInvoices, getEarningsAnalytics,
  banUser, unbanUser, verifyExpert, updateExpertStatus, approveProject, rejectProject, resolveDispute, closeDispute, actionReport, processPayout, inviteAdmin
};