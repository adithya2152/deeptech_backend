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

    if (base.role === 'buyer') {
      await ProfileModel.ensureBuyerRow(userId);
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
