import { Invitation } from '../models/invitationModel.js';
import { notifyExpertInvitationReceived } from './notificationController.js';
import pool from '../config/db.js';

export const invitationController = {
  async sendInvitation(req, res) {
    const { project_id, expert_profile_id, message, engagement_model, payment_terms } = req.body;
    const buyerProfileId = req.user.profileId;

    try {
      const allowedModels = new Set(['daily', 'sprint', 'fixed', 'hourly']);
      const model = String(engagement_model || 'daily');
      if (!allowedModels.has(model)) {
        return res.status(400).json({ success: false, message: 'Invalid engagement_model' });
      }

      const terms = payment_terms && typeof payment_terms === 'object' ? payment_terms : {};
      const num = (v) => Number(v);
      const isNonNegative = (n) => Number.isFinite(n) && n >= 0;
      const isPositive = (n) => Number.isFinite(n) && n > 0;

      const rejectTerms = (msg) => res.status(400).json({ success: false, message: msg });

      if (model === 'daily') {
        const rate = num(terms.daily_rate);
        const days = num(terms.total_days);
        if (!isNonNegative(rate) || !isNonNegative(days)) return rejectTerms('Daily terms cannot be negative.');
        if (!isPositive(rate) || !isPositive(days)) return rejectTerms('Daily rate and total days must be greater than 0.');
      }
      if (model === 'sprint') {
        const rate = num(terms.sprint_rate);
        const sprints = num(terms.total_sprints);
        const duration = num(terms.sprint_duration_days);
        if (!isNonNegative(rate) || !isNonNegative(sprints) || !isNonNegative(duration)) return rejectTerms('Sprint terms cannot be negative.');
        if (!isPositive(rate) || !isPositive(sprints) || !isPositive(duration)) return rejectTerms('Sprint rate, total sprints, and duration must be greater than 0.');
      }
      if (model === 'fixed') {
        const total = num(terms.total_amount);
        if (!isNonNegative(total)) return rejectTerms('Fixed amount cannot be negative.');
        if (!isPositive(total)) return rejectTerms('Fixed amount must be greater than 0.');
      }
      if (model === 'hourly') {
        const rate = num(terms.hourly_rate);
        const hours = num(terms.estimated_hours);
        if (!isNonNegative(rate) || !isNonNegative(hours)) return rejectTerms('Hourly terms cannot be negative.');
        if (!isPositive(rate) || !isPositive(hours)) return rejectTerms('Hourly rate and estimated hours must be greater than 0.');
      }

      const isOwner = await Invitation.verifyProjectOwnership(project_id, buyerProfileId);
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Project does not belong to you.' });
      }

      const existing = await Invitation.findPending(project_id, expert_profile_id);
      if (existing) {
        return res.status(400).json({ success: false, message: 'Invitation already pending.' });
      }

      const invitation = await Invitation.create(project_id, expert_profile_id, message, model, terms);

      // Fetch project and buyer details for notification
      const projectResult = await pool.query('SELECT title, currency FROM projects WHERE id = $1', [project_id]);
      const projectTitle = projectResult.rows[0]?.title || 'Unknown Project';

      // Get buyer name
      const buyerResult = await pool.query(
        `SELECT u.first_name, u.last_name, p.company_name 
         FROM profiles p 
         JOIN user_accounts u ON p.user_id = u.id 
         WHERE p.id = $1`,
        [buyerProfileId]
      );
      const buyer = buyerResult.rows[0];
      const buyerName = buyer?.company_name || `${buyer?.first_name} ${buyer?.last_name}`;

      await notifyExpertInvitationReceived(expert_profile_id, buyerName, projectTitle, project_id);

      res.json({ success: true, data: invitation });
    } catch (err) {
      console.error('Error sending invitation:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async getMyInvitations(req, res) {
    const expertProfileId = req.user.profileId;
    try {
      const invitations = await Invitation.getByExpertProfileId(expertProfileId);
      res.json({ success: true, data: invitations });
    } catch (err) {
      console.error('Error fetching invitations:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async respondToInvitation(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    const expertProfileId = req.user.profileId;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
      if (status === 'accepted') {
        // Perform transaction: Update Invite -> Update Project -> Create Contract
        const result = await Invitation.acceptInvitationTransaction(id, expertProfileId);
        res.json({
          success: true,
          data: result.invitation,
          contractId: result.contractId,
          message: 'Invitation accepted and contract created.'
        });
      } else {
        // Simple decline
        const invitation = await Invitation.updateStatus(id, expertProfileId, status);
        if (!invitation) {
          return res.status(404).json({ success: false, message: 'Invitation not found or unauthorized' });
        }
        res.json({ success: true, data: invitation });
      }
    } catch (err) {
      console.error('Error updating invitation:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  }
};