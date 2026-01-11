import { Invitation } from '../models/invitationModel.js';

export const invitationController = {
  async sendInvitation(req, res) {
    const { project_id, expert_id, message } = req.body;
    const buyer_id = req.user.id;

    try {
      const isOwner = await Invitation.verifyProjectOwnership(project_id, buyer_id);
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Project does not belong to you.' });
      }

      const existing = await Invitation.findPending(project_id, expert_id);
      if (existing) {
        return res.status(400).json({ success: false, message: 'Invitation already pending.' });
      }

      const invitation = await Invitation.create(project_id, expert_id, message);
      res.json({ success: true, data: invitation });
    } catch (err) {
      console.error('Error sending invitation:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async getMyInvitations(req, res) {
    const expert_id = req.user.id;
    try {
      const invitations = await Invitation.getByExpertId(expert_id);
      res.json({ success: true, data: invitations });
    } catch (err) {
      console.error('Error fetching invitations:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async respondToInvitation(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    const expert_id = req.user.id;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
      if (status === 'accepted') {
        // Perform transaction: Update Invite -> Update Project -> Create Contract
        const result = await Invitation.acceptInvitationTransaction(id, expert_id);
        res.json({ 
          success: true, 
          data: result.invitation, 
          contractId: result.contractId,
          message: 'Invitation accepted and contract created.' 
        });
      } else {
        // Simple decline
        const invitation = await Invitation.updateStatus(id, expert_id, status);
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