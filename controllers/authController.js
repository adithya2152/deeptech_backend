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
      [userId]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[getActiveProfile] Error:', err);
    return null;
  }
};

// Helper to get all profiles for a user
const getAllProfiles = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, profile_type, is_active FROM profiles WHERE user_id = $1`,
      [userId]
    );
    return rows;
  } catch (err) {
    console.error('[getAllProfiles] Error:', err);
    return [];
  }
};

// Helper to determine the active role
const getActiveRole = async (userId) => {
  const profile = await getActiveProfile(userId);
  return profile?.profile_type || 'buyer';
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
    { expiresIn: jwtExpiry }
  );

  const refreshToken = jwt.sign(
    {
      id: userId,
      email,
      type: "refresh",
    },
    jwtSecret,
    { expiresIn: refreshTokenExpiry }
  );

  return { accessToken, refreshToken };
};

export const sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    // Check user_accounts instead of profiles
    const existingUser = await pool.query("SELECT id FROM user_accounts WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: "User already exists. Please login." });
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) throw error;

    return res.status(200).json({ success: true, message: `OTP sent to ${email}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
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
        type: "signup_ticket"
      },
      jwtSecret,
      { expiresIn: "15m" }
    );

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: { signupTicket }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
  }
};

export const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role = "buyer", domains = [], phone, signupTicket } = req.body;

    if (!email || !password || !signupTicket) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    let userId;
    try {
      const decoded = jwt.verify(signupTicket, jwtSecret);
      if (decoded.type !== "signup_ticket" || decoded.email !== email) {
        throw new Error("Invalid ticket");
      }
      userId = decoded.userId;
    } catch (e) {
      return res.status(401).json({ success: false, message: "Invalid or expired verification session" });
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
      [email]
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

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: password,
      user_metadata: { first_name, last_name, role, phone }
    });

    if (updateError) throw updateError;

    // 1. Create user_accounts entry
    await pool.query(
      `INSERT INTO user_accounts (id, email, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET 
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         role = EXCLUDED.role`,
      [userId, email, first_name || "", last_name || "", role]
    );

    // 2. Create profile entry in profiles table
    const { rows: profileRows } = await pool.query(
      `INSERT INTO profiles (user_id, profile_type, is_active, created_at, updated_at)
       VALUES ($1, $2, true, NOW(), NOW())
       RETURNING id, profile_type, is_active`,
      [userId, role]
    );
    const profile = profileRows[0];

    // 3. Create role-specific entry using profile_id as PK
    if (role === 'expert') {
      const expertDomains = Array.isArray(domains) && domains.length > 0 ? domains : [];

      await pool.query(
        `INSERT INTO experts (
          id, expert_profile_id, domains, experience_summary, is_active
        ) VALUES ($1, $2, $3, $4, true)`,
        [
          userId,
          profile.id,
          expertDomains,
          `Expert in ${expertDomains.join(', ') || 'deep-tech'} ready for projects`
        ]
      );
    } else if (role === 'buyer') {
      await pool.query(
        `INSERT INTO buyers (id, buyer_profile_id, is_active) VALUES ($1, $2, true)
         ON CONFLICT (buyer_profile_id) DO NOTHING`,
        [userId, profile.id]
      );
    }

    const { accessToken, refreshToken } = generateTokens(userId, email, role, profile.id);

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
    console.error('[register] Error:', error);
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
              profile_completion, is_banned, ban_reason 
       FROM user_accounts WHERE id = $1`,
      [userId]
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
        code: "USER_BANNED"
      });
    }

    // Get active profile from profiles table
    const activeProfile = await getActiveProfile(userId);
    const activeRole = activeProfile?.profile_type || user.role || 'buyer';
    const profileId = activeProfile?.id || null;

    const { accessToken, refreshToken } = generateTokens(
      userId,
      email,
      activeRole,
      profileId
    );

    await pool.query("UPDATE user_accounts SET last_login = NOW() WHERE id = $1", [
      userId,
    ]);

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
      [decoded.id]
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
        code: "USER_BANNED"
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
      { expiresIn: jwtExpiry }
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
        [userId]
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
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const origin = req.headers.origin;
    const PROD_FRONTEND_URL = "https://deeptech-frontend.vercel.app";

    const isLocalhostUrl = (value) => {
      try {
        const url = new URL(String(value));
        return url.hostname === "localhost" || url.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    };

    const baseUrl =
      process.env.FRONTEND_URL ||
      (origin && !isLocalhostUrl(origin) ? origin : undefined) ||
      PROD_FRONTEND_URL;

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
      message: "If an account exists for that email, a password reset link has been sent.",
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
        message: "Invalid or expired recovery session. Please request a new reset link.",
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
      message: "Password updated successfully. Please log in with your new password.",
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
              profile_completion, created_at, last_login
       FROM user_accounts WHERE id = $1`,
      [userId]
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

    const { first_name, last_name, avatar_url, banner_url, timezone } = req.body;

    const result = await pool.query(
      `
      UPDATE user_accounts
      SET
        first_name = COALESCE($1, first_name),
        last_name  = COALESCE($2, last_name),
        avatar_url = COALESCE($3, avatar_url),
        banner_url = COALESCE($4, banner_url),
        timezone   = COALESCE($5, timezone),
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, email, first_name, last_name, role, avatar_url, banner_url, timezone, created_at
      `,
      [first_name, last_name, avatar_url, banner_url, timezone, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
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
    const type = typeof typeRaw === 'string' ? typeRaw : String(typeRaw || ''); // avatar | banner
    const file = req.file;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "File required" });
    }

    if (!["avatar", "banner"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid media type" });
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
      console.error('Supabase upload error:', uploadResult.error);
      return res.status(500).json({ success: false, message: uploadResult.error.message || JSON.stringify(uploadResult.error) });
    }

    const { data } = supabase.storage
      .from("profile-media")
      .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
      console.error('Supabase publicUrl missing for', filePath, uploadResult);
      return res.status(500).json({ success: false, message: 'Failed to obtain public URL after upload' });
    }

    // Add cache-busting timestamp to force browsers to fetch the new image
    const urlWithCacheBuster = `${data.publicUrl}?t=${Date.now()}`;

    // Update user_accounts instead of profiles
    await pool.query(
      `UPDATE user_accounts SET ${type}_url = $1, updated_at = NOW() WHERE id = $2`,
      [urlWithCacheBuster, userId]
    );

    res.json({ success: true, url: urlWithCacheBuster });
  } catch (err) {
    console.error('uploadProfileMedia error:', err);
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
    const activeProfile = allProfiles.find(p => p.is_active);
    const currentRole = activeProfile?.profile_type || 'buyer';
    const newRole = currentRole === "buyer" ? "expert" : "buyer";

    // Check if the new role profile exists
    let newRoleProfile = allProfiles.find(p => p.profile_type === newRole);

    if (!newRoleProfile) {
      // Create the new profile
      const { rows } = await pool.query(
        `INSERT INTO profiles (user_id, profile_type, is_active, created_at, updated_at)
         VALUES ($1, $2, false, NOW(), NOW())
         RETURNING id, profile_type, is_active`,
        [userId, newRole]
      );
      newRoleProfile = rows[0];

      // Create the role-specific record
      if (newRole === 'expert') {
        await pool.query(
          `INSERT INTO experts (id, expert_profile_id, domains, experience_summary, is_active)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (expert_profile_id) DO NOTHING`,
          [userId, newRoleProfile.id, [], "New expert profile"]
        );
      } else if (newRole === 'buyer') {
        await pool.query(
          `INSERT INTO buyers (id, buyer_profile_id, is_active)
           VALUES ($1, $2, false)
           ON CONFLICT (buyer_profile_id) DO NOTHING`,
          [userId, newRoleProfile.id]
        );
      }
    }

    // Deactivate current profile, activate new profile
    if (activeProfile) {
      await pool.query(
        `UPDATE profiles SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [activeProfile.id]
      );
    }

    await pool.query(
      `UPDATE profiles SET is_active = true, updated_at = NOW() WHERE id = $1`,
      [newRoleProfile.id]
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
    console.error('[switchRole] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
