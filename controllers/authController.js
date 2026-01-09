import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";
import pool from "../config/db.js";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRY || "24h";
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";

const generateTokens = (userId, email, role = "buyer") => {
  const accessToken = jwt.sign(
    {
      id: userId,
      email,
      role,
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

    const existingProfile = await pool.query("SELECT id FROM profiles WHERE email = $1", [email]);
    if (existingProfile.rows.length > 0) {
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

    const existingUser = await pool.query(
      "SELECT id FROM profiles WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: password,
      user_metadata: { first_name, last_name, role, phone }
    });

    if (updateError) throw updateError;

    const result = await pool.query(
      `INSERT INTO profiles (id, email, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role`,
      [userId, email, first_name || "", last_name || "", role]
    );

    const user = result.rows[0];

    if (role === 'expert') {
      const expertDomains = Array.isArray(domains) && domains.length > 0
        ? domains
        : ['general'];

      await pool.query(
        `INSERT INTO experts (
          id, domains, experience_summary, 
          hourly_rate_advisory, hourly_rate_architecture, hourly_rate_execution
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          expertDomains,
          `Expert in ${expertDomains.join(', ')} ready for deep-tech projects`,
          50, 75, 100
        ]
      );
    }

    const { accessToken, refreshToken } = generateTokens(userId, email, role);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
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

    const result = await pool.query(
      "SELECT id, email, first_name, last_name, role, avatar_url, created_at, is_banned, ban_reason FROM profiles WHERE id = $1",
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

    const { accessToken, refreshToken } = generateTokens(
      userId,
      email,
      user.role
    );

    await pool.query("UPDATE profiles SET last_login = NOW() WHERE id = $1", [
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
          role: user.role,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
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

    const result = await pool.query(
      "SELECT id, email, role, is_banned, ban_reason FROM profiles WHERE id = $1",
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

    const newAccessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
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
        "UPDATE profiles SET last_logout = NOW() WHERE id = $1",
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
      `SELECT id, email, first_name, last_name, role, avatar_url, created_at, last_login 
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          avatar_url: user.avatar_url,
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

    const { first_name, last_name, avatar_url, banner_url } = req.body;

    const result = await pool.query(
      `
      UPDATE profiles
      SET
        first_name = COALESCE($1, first_name),
        last_name  = COALESCE($2, last_name),
        avatar_url = COALESCE($3, avatar_url),
        banner_url = COALESCE($4, banner_url),
        updated_at = NOW()
      WHERE id = $5
      RETURNING id, email, first_name, last_name, role, avatar_url, banner_url, created_at
      `,
      [first_name, last_name, avatar_url, banner_url, userId]
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