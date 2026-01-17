import ProfileModel from "../models/profileModel.js";
import { computeProfileCompletion } from "../services/profileCompletion.js";

export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const parts = await ProfileModel.getProfilePartsForCompletion(userId);
    if (!parts?.base) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    const computed = computeProfileCompletion(parts);
    if (parts.base.profile_completion !== computed) {
      await ProfileModel.setProfileCompletion(userId, computed);
    }

    const user = await ProfileModel.getFullProfileById(userId);

    if (user?.role === "expert") {
      user.expert_has_resume = !!parts.expertHasResume;
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to load profile" });
  }
};

export const getUserReviews = async (req, res) => {
  try {
    const userId = req.params.id;

    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ success: false, message: 'Valid user ID is required' });
    }

    const role = req.query.role || null; // Optional: 'buyer' or 'expert'
    const rows = await ProfileModel.getUserReviews(userId, role);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getUserReviews error', err);
    return res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
}

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const base = await ProfileModel.getBaseProfileById(userId);
    if (!base) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }


    await ProfileModel.updateBaseProfile(userId, req.body);

    // Get active profile to determine role
    const activeProfile = await ProfileModel.getActiveProfile(userId);
    const role = activeProfile?.profile_type || base.role;

    if (role === 'buyer') {
      // Ensure buyer row exists with the correct profile_id
      if (activeProfile?.id) {
        await ProfileModel.ensureBuyerRow(userId, activeProfile.id);
      }
      await ProfileModel.updateBuyerProfile(userId, req.body);
    }

    const parts = await ProfileModel.getProfilePartsForCompletion(userId);
    if (parts?.base) {
      const computed = computeProfileCompletion(parts);
      await ProfileModel.setProfileCompletion(userId, computed);
    }

    const merged = await ProfileModel.getFullProfileById(userId);

    if (merged?.role === "expert") {
      merged.expert_has_resume = !!parts?.expertHasResume;
    }
    res.json({
      success: true,
      data: { user: merged },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

import pool from "../config/db.js";

// Increment helpful count on a review
export const incrementHelpful = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const userId = req.user.id;
    const profileId = req.user.profileId;

    // Get the feedback to check ownership
    const { rows: feedback } = await pool.query(
      `SELECT giver_id, receiver_id FROM feedback WHERE id = $1`,
      [feedbackId]
    );

    if (feedback.length === 0) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const { giver_id, receiver_id } = feedback[0];

    // Prevent the giver and receiver from clicking helpful
    if (String(giver_id) === String(profileId) || String(receiver_id) === String(profileId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot mark your own review as helpful"
      });
    }

    // Check if user already voted helpful on this feedback
    const { rows: existingVote } = await pool.query(
      `SELECT id FROM feedback_helpful_votes WHERE feedback_id = $1 AND voter_id = $2`,
      [feedbackId, userId]
    );

    if (existingVote.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You have already marked this review as helpful"
      });
    }

    // Record the vote
    await pool.query(
      `INSERT INTO feedback_helpful_votes (feedback_id, voter_id) VALUES ($1, $2)`,
      [feedbackId, userId]
    );

    // Increment the helpful count
    const { rows: updated } = await pool.query(
      `UPDATE feedback SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count`,
      [feedbackId]
    );

    res.json({
      success: true,
      message: "Marked as helpful",
      data: { helpful_count: updated[0].helpful_count }
    });
  } catch (err) {
    console.error("incrementHelpful error:", err);
    res.status(500).json({ success: false, message: "Failed to mark as helpful" });
  }
};
