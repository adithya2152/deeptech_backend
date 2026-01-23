import jwt from "jsonwebtoken";
import path from "path";
import { supabase } from "../config/supabase.js";
import pool from "../config/db.js";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRY || "24h";
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// Helper to get active profile for a user from profiles table
const getActiveProfile = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active 
       FROM profiles 
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  } catch (err) {
    console.error("[getActiveProfile] Error:", err);
    return null;
  }
};

// Helper to get all profiles for a user
const getAllProfiles = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active FROM profiles WHERE user_id = $1`,
      [userId],
    );
    return rows;
  } catch (err) {
    console.error("[getAllProfiles] Error:", err);
    return [];
  }
};

// Helper to determine the active role
const getActiveRole = async (userId) => {
  const profile = await getActiveProfile(userId);
  return profile?.profile_type || "buyer";
};

const generateTokens = (userId, email, role = "buyer", profileId = null) => {
  const accessToken = jwt.sign(
    {
      id: userId,
      email,
      role,
      profileId,
      type: "access",
    },
    jwtSecret,
    { expiresIn: jwtExpiry },
  );

  const refreshToken = jwt.sign(
    {
      id: userId,
      email,
      type: "refresh",
    },
    jwtSecret,
    { expiresIn: refreshTokenExpiry },
  );

  return { accessToken, refreshToken };
};

export const sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });

    // Check user_accounts instead of profiles
    const existingUser = await pool.query(
      "SELECT id FROM user_accounts WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists. Please login.",
      });
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) throw error;

    return res
      .status(200)
      .json({ success: true, message: `OTP sent to ${email}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) throw error;

    const signupTicket = jwt.sign(
      {
        email,
        userId: data.user.id,
        type: "signup_ticket",
      },
      jwtSecret,
      { expiresIn: "15m" },
    );

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: { signupTicket },
    });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired OTP" });
  }
};

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      role = "buyer",
      domains = [],
      phone,
      signupTicket,
    } = req.body;

    if (!email || !password || !signupTicket) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    let userId;
    try {
      const decoded = jwt.verify(signupTicket, jwtSecret);
      if (decoded.type !== "signup_ticket" || decoded.email !== email) {
        throw new Error("Invalid ticket");
      }
      userId = decoded.userId;
    } catch (e) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired verification session",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Check user_accounts instead of profiles for existing user
    const existingUser = await pool.query(
      "SELECT id FROM user_accounts WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      // If the existing user is the same as the one we are registering (verified by OTP ticket),
      // we allow the process to continue (it will update the profile).
      if (existingUser.rows[0].id !== userId) {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        password: password,
        user_metadata: { first_name, last_name, role, phone },
      },
    );

    if (updateError) throw updateError;

    // 1. Create user_accounts entry
    await pool.query(
      `INSERT INTO user_accounts (id, email, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET 
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         role = EXCLUDED.role`,
      [userId, email, first_name || "", last_name || "", role],
    );

    // 2. Create profile entry in profiles table
    const { rows: profileRows } = await pool.query(
      `INSERT INTO profiles (user_id, profile_type, is_active, created_at, updated_at)
       VALUES ($1, $2, true, NOW(), NOW())
       RETURNING id, profile_type, is_active`,
      [userId, role],
    );
    const profile = profileRows[0];

    // 3. Create role-specific entry using profile_id as PK
    if (role === "expert") {
      const expertDomains =
        Array.isArray(domains) && domains.length > 0 ? domains : [];

      await pool.query(
        `INSERT INTO experts (
          id, expert_profile_id, domains, experience_summary, is_active
        ) VALUES ($1, $2, $3, $4, true)`,
        [
          userId,
          profile.id,
          expertDomains,
          `Expert in ${expertDomains.join(", ") || "deep-tech"} ready for projects`,
        ],
      );

      // ✅ Generate embedding for new expert (async, non-blocking)
      generateEmbeddingAsync(profile.id).catch((err) => {
        console.error(
          "Failed to generate embedding for new expert:",
          err.message,
        );
      });

      // ✅ Generate embedding for new expert (async, non-blocking)
      generateEmbeddingAsync(profile.id).catch((err) => {
        console.error(
          "Failed to generate embedding for new expert:",
          err.message,
        );
      });
    } else if (role === "buyer") {
      await pool.query(
        `INSERT INTO buyers (id, buyer_profile_id, is_active) VALUES ($1, $2, true)
         ON CONFLICT (buyer_profile_id) DO NOTHING`,
        [userId, profile.id],
      );
    }

    const { accessToken, refreshToken } = generateTokens(
      userId,
      email,
      role,
      profile.id,
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          id: userId,
          email: email,
          first_name: first_name || "",
          last_name: last_name || "",
          role: role,
          profileId: profile.id,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("[register] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const userId = authData.user.id;

    // Query user_accounts for user data
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar_url, banner_url, 
              profile_completion, is_banned, ban_reason, preferred_language 
       FROM user_accounts WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const user = result.rows[0];

    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended.",
        reason: user.ban_reason,
        code: "USER_BANNED",
      });
    }

    // Get active profile from profiles table
    const activeProfile = await getActiveProfile(userId);
    const activeRole = activeProfile?.profile_type || user.role || "buyer";
    const profileId = activeProfile?.id || null;

    const { accessToken, refreshToken } = generateTokens(
      userId,
      email,
      activeRole,
      profileId,
    );

    await pool.query(
      "UPDATE user_accounts SET last_login = NOW() WHERE id = $1",
      [userId],
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: activeRole,
          profileId: profileId,
          avatar_url: user.avatar_url,
          banner_url: user.banner_url,
          profile_completion: user.profile_completion,
          preferred_language: user.preferred_language,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    const decoded = jwt.verify(refreshToken, jwtSecret);

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    // Query user_accounts
    const result = await pool.query(
      "SELECT id, email, role, is_banned, ban_reason FROM user_accounts WHERE id = $1",
      [decoded.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended.",
        reason: user.ban_reason,
        code: "USER_BANNED",
      });
    }

    // Get active profile
    const activeProfile = await getActiveProfile(decoded.id);
    const activeRole = activeProfile?.profile_type || user.role;

    const newAccessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: activeRole,
        profileId: activeProfile?.id || null,
        type: "access",
      },
      jwtSecret,
      { expiresIn: jwtExpiry },
    );

    return res.status(200).json({
      success: true,
      message: "Access token refreshed",
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Refresh token expired. Please login again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (userId) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("Supabase logout error:", error);

      await pool.query(
        "UPDATE user_accounts SET last_logout = NOW() WHERE id = $1",
        [userId],
      );
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    // Check if user exists in our database
    const existingUser = await pool.query(
      "SELECT id FROM user_accounts WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address.",
      });
    }

    const baseUrl = process.env.PASSWORD_RESET_REDIRECT_BASE_URL;

    if (!baseUrl) {
      return res.status(500).json({
        success: false,
        message:
          "Password reset redirect URL is not configured. Set PASSWORD_RESET_REDIRECT_BASE_URL.",
      });
    }
    const redirectTo = `${String(baseUrl).replace(/\/$/, "")}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.error("[requestPasswordReset] Supabase error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to send password reset email. Please try again later.",
      });
    }

    // Avoid email enumeration: always respond success when configured correctly.
    return res.status(200).json({
      success: true,
      message:
        "If an account exists for that email, a password reset link has been sent.",
      data: { redirectTo },
    });
  } catch (error) {
    console.error("[requestPasswordReset] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to send password reset email. Please try again later.",
    });
  }
};

export const resetPasswordWithRecoveryTokens = async (req, res) => {
  try {
    const { accessToken, refreshToken, password } = req.body;

    if (!accessToken || !refreshToken || !password) {
      return res.status(400).json({
        success: false,
        message: "accessToken, refreshToken, and password are required",
      });
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired recovery session. Please request a new reset link.",
      });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || "Failed to update password",
      });
    }

    // Best-effort cleanup
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      success: true,
      message:
        "Password updated successfully. Please log in with your new password.",
    });
  } catch (error) {
    console.error("[resetPasswordWithRecoveryTokens] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar_url, banner_url, timezone,
              profile_completion, preferred_language, created_at, last_login
       FROM user_accounts WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];
    const activeProfile = await getActiveProfile(userId);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: activeProfile?.profile_type || user.role,
          profileId: activeProfile?.id || null,
          avatar_url: user.avatar_url,
          banner_url: user.banner_url,
          timezone: user.timezone,
          preferred_language: user.preferred_language,
          profile_completion: user.profile_completion,
          created_at: user.created_at,
          last_login: user.last_login,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const updateCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      first_name,
      last_name,
      avatar_url,
      banner_url,
      timezone,
      preferred_language,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE user_accounts
      SET
        first_name = COALESCE($1, first_name),
        last_name  = COALESCE($2, last_name),
        avatar_url = COALESCE($3, avatar_url),
        banner_url = COALESCE($4, banner_url),
        timezone   = COALESCE($5, timezone),
        preferred_language = COALESCE($6, preferred_language),
        updated_at = NOW()
      WHERE id = $7
      RETURNING id, email, first_name, last_name, role, avatar_url, banner_url, timezone, preferred_language, created_at
      `,
      [
        first_name,
        last_name,
        avatar_url,
        banner_url,
        timezone,
        preferred_language,
        userId,
      ],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update current user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

/* ================= PROFILE MEDIA ================= */

export const uploadProfileMedia = async (req, res) => {
  try {
    const userId = req.user?.id;
    const typeRaw = req.query?.type;
    const type = typeof typeRaw === "string" ? typeRaw : String(typeRaw || ""); // avatar | banner
    const file = req.file;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "File required" });
    }

    if (!["avatar", "banner"].includes(type)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid media type" });
    }

    const ext = path.extname(file.originalname);
    const filePath = `profiles/${userId}/${type}${ext}`;

    const uploadResult = await supabase.storage
      .from("profile-media")
      .upload(filePath, file.buffer, {
        upsert: true,
        contentType: file.mimetype,
      });

    if (uploadResult.error) {
      console.error("Supabase upload error:", uploadResult.error);
      return res.status(500).json({
        success: false,
        message:
          uploadResult.error.message || JSON.stringify(uploadResult.error),
      });
    }

    const { data } = supabase.storage
      .from("profile-media")
      .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
      console.error("Supabase publicUrl missing for", filePath, uploadResult);
      return res.status(500).json({
        success: false,
        message: "Failed to obtain public URL after upload",
      });
    }

    // Add cache-busting timestamp to force browsers to fetch the new image
    const urlWithCacheBuster = `${data.publicUrl}?t=${Date.now()}`;

    // Update user_accounts instead of profiles
    await pool.query(
      `UPDATE user_accounts SET ${type}_url = $1, updated_at = NOW() WHERE id = $2`,
      [urlWithCacheBuster, userId],
    );

    res.json({ success: true, url: urlWithCacheBuster });
  } catch (err) {
    console.error("uploadProfileMedia error:", err);
    const message = err && err.message ? err.message : String(err);
    res.status(500).json({ success: false, message });
  }
};

/* ================= SWITCH ROLE (BIDIRECTIONAL) ================= */

export const switchRole = async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    // Get all profiles for this user
    const allProfiles = await getAllProfiles(userId);
    const activeProfile = allProfiles.find((p) => p.is_active);
    const currentRole = activeProfile?.profile_type || "buyer";
    const newRole = currentRole === "buyer" ? "expert" : "buyer";

    // Check if the new role profile exists
    let newRoleProfile = allProfiles.find((p) => p.profile_type === newRole);

    if (!newRoleProfile) {
      // Create the new profile
      const { rows } = await pool.query(
        `INSERT INTO profiles (user_id, profile_type, is_active, created_at, updated_at)
         VALUES ($1, $2, false, NOW(), NOW())
         RETURNING id, profile_type, is_active`,
        [userId, newRole],
      );
      newRoleProfile = rows[0];

      // Create the role-specific record
      if (newRole === "expert") {
        await pool.query(
          `INSERT INTO experts (id, expert_profile_id, domains, experience_summary, is_active)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (expert_profile_id) DO NOTHING`,
          [userId, newRoleProfile.id, [], "New expert profile"],
        );

        // ✅ Generate embedding for new expert profile (async, non-blocking)
        generateEmbeddingAsync(newRoleProfile.id).catch((err) => {
          console.error(
            "Failed to generate embedding for role switch:",
            err.message,
          );
        });

        // ✅ Generate embedding for new expert profile (async, non-blocking)
        generateEmbeddingAsync(newRoleProfile.id).catch((err) => {
          console.error(
            "Failed to generate embedding for role switch:",
            err.message,
          );
        });
      } else if (newRole === "buyer") {
        await pool.query(
          `INSERT INTO buyers (id, buyer_profile_id, is_active)
           VALUES ($1, $2, false)
           ON CONFLICT (buyer_profile_id) DO NOTHING`,
          [userId, newRoleProfile.id],
        );
      }
    }

    // Deactivate current profile, activate new profile
    if (activeProfile) {
      await pool.query(
        `UPDATE profiles SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [activeProfile.id],
      );
    }

    await pool.query(
      `UPDATE profiles SET is_active = true, updated_at = NOW() WHERE id = $1`,
      [newRoleProfile.id],
    );

    const tokens = generateTokens(userId, email, newRole, newRoleProfile.id);

    return res.json({
      success: true,
      data: {
        role: newRole,
        profileId: newRoleProfile.id,
        tokens,
      },
    });
  } catch (err) {
    console.error("[switchRole] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ================= ACCEPT ADMIN INVITE ================= */

export const acceptAdminInvite = async (req, res) => {
  try {
    const userId = req.user?.id;
    const email = req.user?.email;
    const { inviteToken } = req.body;

    if (!userId || !email) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    if (!inviteToken) {
      return res
        .status(400)
        .json({ success: false, message: "inviteToken is required" });
    }

    if (!jwtSecret) {
      return res
        .status(500)
        .json({ success: false, message: "JWT_SECRET not configured" });
    }

    let payload;
    try {
      payload = jwt.verify(inviteToken, jwtSecret);
    } catch {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired invite token" });
    }

    if (!payload || payload.type !== "admin_invite" || !payload.email) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid invite token" });
    }

    if (String(payload.email).toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "Invite token does not match your account email",
      });
    }

    await pool.query(
      `UPDATE user_accounts SET role = 'admin', updated_at = NOW() WHERE id = $1`,
      [userId],
    );

    const activeProfile = await getActiveProfile(userId);
    const tokens = generateTokens(
      userId,
      email,
      "admin",
      activeProfile?.id || null,
    );

    return res.json({
      success: true,
      message: "Admin role activated",
      data: {
        role: "admin",
        tokens,
      },
    });
  } catch (err) {
    console.error("[acceptAdminInvite] Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Account - Permanently deletes the user and all associated data
export const deleteAccount = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  try {
    // Start a transaction for data integrity
    await pool.query("BEGIN");

    try {
      // Delete in order of dependencies (child records first)

      // Delete work logs
      await pool.query(
        `DELETE FROM work_logs WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete day work summaries
      await pool.query(
        `DELETE FROM day_work_summaries WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete disputes
      await pool.query(
        `DELETE FROM disputes WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete invoices
      await pool.query(
        `DELETE FROM invoices WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete contract documents
      await pool.query(
        `DELETE FROM contract_documents WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete time entries
      await pool.query(
        `DELETE FROM time_entries WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete feedback (was reviews)
      // Check column names: contractModel says (contract_id, giver_id, receiver_id)
      await pool.query(
        `DELETE FROM feedback WHERE contract_id IN (
        SELECT id FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      ) OR giver_id = $1 OR receiver_id = $1`,
        [userId],
      );

      // Delete helpful votes on feedback
      await pool.query(`DELETE FROM feedback_helpful_votes WHERE voter_id = $1`, [userId]);

      // Delete contracts
      await pool.query(
        `DELETE FROM contracts WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1) OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)`,
        [userId],
      );

      // Delete proposals
      await pool.query(
        `DELETE FROM proposals WHERE expert_profile_id IN (
        SELECT id FROM profiles WHERE user_id = $1
      )`,
        [userId],
      );

      // Delete expert_documents
      await pool.query(`DELETE FROM expert_documents WHERE expert_id = $1`, [userId]);

      // Delete project invitations
      await pool.query(
        `DELETE FROM project_invitations WHERE expert_profile_id IN (
        SELECT id FROM profiles WHERE user_id = $1
      ) OR project_id IN (
        SELECT id FROM projects WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      )`,
        [userId],
      );

      // Delete projects
      await pool.query(`DELETE FROM projects WHERE buyer_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)`, [userId]);

      // Delete message attachments first (FK to messages)
      await pool.query(`DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM messages WHERE sender_id = $1)`, [userId]);

      // Delete messages
      await pool.query(`DELETE FROM messages WHERE sender_id = $1`, [userId]);

      // Delete chat_members (was conversation_participants)
      await pool.query(
        `DELETE FROM chat_members WHERE user_id = $1`,
        [userId],
      );

      // Delete notifications
      await pool.query(`DELETE FROM notifications WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = $1)`, [userId]);

      // Delete user_preferred_currency
      await pool.query(`DELETE FROM user_preferred_currency WHERE user_id = $1`, [userId]);

      // Delete answer_votes
      await pool.query(`DELETE FROM answer_votes WHERE voter_id = $1`, [userId]);

      // Delete blogs
      await pool.query(`DELETE FROM blogs WHERE author_id = $1`, [userId]);

      // Delete circumvention_logs
      await pool.query(`DELETE FROM circumvention_logs WHERE user_id = $1`, [userId]);

      // Delete conversations
      await pool.query(`DELETE FROM conversations WHERE participant_1 = $1 OR participant_2 = $1`, [userId]);

      // Delete doubt_answers
      await pool.query(`DELETE FROM doubt_answers WHERE user_id = $1`, [userId]);

      // Delete expert_ai_evaluations
      await pool.query(`
        DELETE FROM expert_ai_evaluations 
        WHERE reviewed_by = $1 
        OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      `, [userId]);

      // Delete expert_capability_scores
      await pool.query(`
        DELETE FROM expert_capability_scores 
        WHERE reviewed_by = $1 
        OR expert_profile_id IN (SELECT id FROM profiles WHERE user_id = $1)
      `, [userId]);

      // Delete reports
      await pool.query(`DELETE FROM reports WHERE reporter_id = $1 OR reported_id = $1`, [userId]);

      // Delete score_adjustments_log
      await pool.query(`DELETE FROM score_adjustments_log WHERE user_id = $1 OR admin_id = $1`, [userId]);

      // Delete score_history
      await pool.query(`DELETE FROM score_history WHERE user_id = $1`, [userId]);

      // Delete user scores
      await pool.query(`DELETE FROM user_scores WHERE user_id = $1`, [userId]);

      // Delete user tags
      await pool.query(`DELETE FROM user_tags WHERE user_id = $1`, [userId]);

      // Delete rank tiers
      await pool.query(`DELETE FROM user_rank_tiers WHERE user_id = $1`, [
        userId,
      ]);

      // Delete expert profile if exists
      // experts table uses 'id' as FK to user_accounts
      await pool.query(`DELETE FROM experts WHERE id = $1`, [userId]);

      // Delete buyer profile if exists
      // buyers table uses 'id' as FK to user_accounts
      await pool.query(`DELETE FROM buyers WHERE id = $1`, [userId]);

      // Delete profiles
      await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [userId]);

      // Finally, delete the user account
      await pool.query(`DELETE FROM user_accounts WHERE id = $1`, [userId]);

      // Commit DB transaction first
      await pool.query("COMMIT");

      // ✅ Then delete from Supabase Auth (outside transaction)
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error("Supabase auth delete error:", authDeleteError);
      }

      console.log(
        `[deleteAccount] Successfully deleted user ${userId} and all related data`,
      );

      return res.json({
        success: true,
        message: "Your account has been permanently deleted.",
      });
    } catch (deleteErr) {
      await pool.query("ROLLBACK");
      throw deleteErr;
    }
  } catch (err) {
    console.error("[deleteAccount] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete account. Please contact support.",
    });
  }
};

/**
 * Initiate Google OAuth flow
 * Returns the authorization URL for frontend to redirect to
 */
export const initiateGoogleOAuth = async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Redirect directly to frontend callback to handle hash tokens
        redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        url: data.url,
      },
    });
  } catch (error) {
    console.error("[initiateGoogleOAuth] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate Google OAuth",
    });
  }
};

/**
 * Verify Google OAuth token and create/login user
 * Called from frontend after it receives tokens from Supabase
 */
export const verifyGoogleOAuth = async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        message: "Access token is required",
      });
    }

    // Get user from Supabase using the access token
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(access_token);

    if (userError || !user) {
      console.error("[verifyGoogleOAuth] User fetch error:", userError);
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
      });
    }

    // Check if user exists in user_accounts
    const userAccountResult = await pool.query(
      "SELECT id, email FROM user_accounts WHERE id = $1",
      [user.id],
    );

    let userId = user.id;

    // If user doesn't exist, create them
    if (userAccountResult.rows.length === 0) {
      const firstName = user.user_metadata?.full_name?.split(" ")[0] || "User";
      const lastName =
        user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "";

      await pool.query(
        `INSERT INTO user_accounts (id, email, first_name, last_name, role, email_verified, auth_provider)
         VALUES ($1, $2, $3, $4, 'buyer', true, 'google')`,
        [user.id, user.email, firstName, lastName],
      );
    }

    // Check if user has any profiles
    const profilesResult = await pool.query(
      "SELECT id, profile_type, is_active FROM profiles WHERE user_id = $1",
      [userId],
    );

    let profileType = "buyer"; // Default
    let profileId = null;

    if (profilesResult.rows.length > 0) {
      // User has profiles, get active one or first one
      const activeProfile =
        profilesResult.rows.find((p) => p.is_active) || profilesResult.rows[0];
      profileType = activeProfile.profile_type;
      profileId = activeProfile.id;
    } else {
      // New user - create a default buyer profile
      const newProfileResult = await pool.query(
        `INSERT INTO profiles (user_id, profile_type, is_active)
         VALUES ($1, 'buyer', true)
         RETURNING id, profile_type`,
        [userId],
      );
      profileType = "buyer";
      profileId = newProfileResult.rows[0].id;

      // Create buyer record with profile_id as buyer_profile_id (primary key)
      await pool.query(
        `INSERT INTO buyers (id, buyer_profile_id)
         VALUES ($1, $2)`,
        [userId, profileId],
      );
    }

    // Generate JWT tokens
    const tokens = generateTokens(userId, user.email, profileType, profileId);

    // Update last login on user_accounts table (using userId, not profileId)
    await pool.query(
      "UPDATE user_accounts SET last_login = NOW() WHERE id = $1",
      [userId],
    );

    // Get full user profile data
    const { rows: userRows } = await pool.query(
      `SELECT 
        p.id as profileId,
        p.user_id,
        p.profile_type as role,
        p.is_active,
        p.created_at,
        ua.id,
        ua.email,
        ua.first_name,
        ua.last_name,
        ua.username,
        ua.avatar_url,
        ua.banner_url,
        ua.country,
        ua.timezone,
        ua.email_verified,
        ua.last_login,
        ua.profile_completion,
        ua.preferred_language
      FROM profiles p
      JOIN user_accounts ua ON p.user_id = ua.id
      WHERE p.id = $1`,
      [profileId],
    );

    return res.status(200).json({
      success: true,
      message: "Successfully authenticated with Google",
      data: {
        user: userRows[0],
        tokens,
      },
    });
  } catch (error) {
    console.error("[verifyGoogleOAuth] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify Google OAuth",
    });
  }
};

/**
 * Handle Google OAuth callback
 * Exchanges code for session and creates/updates user in database
 */
export const handleGoogleCallback = async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=no_code`,
      );
    }

    // Exchange code for session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (authError || !user) {
      console.error("[handleGoogleCallback] Auth error:", authError);
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=auth_failed`,
      );
    }

    // Check if user exists in user_accounts
    const userAccountResult = await pool.query(
      "SELECT id, email FROM user_accounts WHERE id = $1",
      [user.id],
    );

    let userId = user.id;

    // If user doesn't exist, create them
    if (userAccountResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO user_accounts (id, email, email_verified, auth_provider)
         VALUES ($1, $2, true, 'google')`,
        [user.id, user.email],
      );
    }

    // Check if user has any profiles
    const profilesResult = await pool.query(
      "SELECT id, profile_type, is_active FROM profiles WHERE user_id = $1",
      [userId],
    );

    let profileType = "buyer"; // Default
    let profileId = null;

    if (profilesResult.rows.length > 0) {
      // User has profiles, get active one or first one
      const activeProfile =
        profilesResult.rows.find((p) => p.is_active) || profilesResult.rows[0];
      profileType = activeProfile.profile_type;
      profileId = activeProfile.id;
    } else {
      // New user - create a default buyer profile
      const newProfileResult = await pool.query(
        `INSERT INTO profiles (user_id, profile_type, first_name, last_name, is_active)
         VALUES ($1, 'buyer', $2, $3, true)
         RETURNING id, profile_type`,
        [
          userId,
          user.user_metadata?.full_name?.split(" ")[0] || "User",
          user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "",
        ],
      );
      profileType = "buyer";
      profileId = newProfileResult.rows[0].id;

      // Create buyer record
      await pool.query("INSERT INTO buyers (profile_id) VALUES ($1)", [
        profileId,
      ]);
    }

    // Generate JWT tokens
    const tokens = generateTokens(userId, user.email, profileType, profileId);

    // Update last login
    await pool.query("UPDATE profiles SET last_login = NOW() WHERE id = $1", [
      profileId,
    ]);

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("[handleGoogleCallback] Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/login?error=callback_failed`);
  }
};

/**
 * Generate embedding for expert asynchronously
 * Called after profile creation/updates to keep semantic search current
 */
async function generateEmbeddingAsync(expertProfileId) {
  try {
    const semanticSearchUrl = process.env.PYTHON_SEMANTIC_SEARCH_URL;
    if (!semanticSearchUrl) {
      console.warn(
        "⚠️  PYTHON_SEMANTIC_SEARCH_URL not configured, skipping embedding generation",
      );
      return;
    }

    console.log(`🔄 Generating embedding for expert: ${expertProfileId}`);

    const response = await fetch(
      `${semanticSearchUrl}/experts/${expertProfileId}/embedding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`Embedding generation failed: ${response.status}`);
    }

    console.log(`✅ Embedding generated for expert: ${expertProfileId}`);
  } catch (error) {
    console.error(
      `❌ Embedding generation error for ${expertProfileId}:`,
      error.message,
    );
    throw error;
  }
}