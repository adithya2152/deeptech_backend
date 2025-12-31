import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
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

export const signup = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role = "buyer", domains = [] } = req.body;
    console.log('📥 RECEIVED:', { email, first_name, last_name, role, domains });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
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

    const hashedPassword = await bcryptjs.hash(password, 10);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error("Supabase signup error:", authError);
      return res.status(400).json({
        success: false,
        message: authError.message || "Failed to create user",
      });
    }

    const userId = authData.user.id;

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
      console.log(`✅ Created expert profile for ${email} with domains: ${expertDomains.join(', ')}`);
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
    console.error("Signup error:", error);
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
      "SELECT id, email, first_name, last_name, role, is_banned, ban_reason FROM profiles WHERE id = $1",
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
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
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

    console.error("Token refresh error:", error);
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
    console.error("Logout error:", error);
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
      `SELECT id, email, first_name, last_name, role, created_at, last_login 
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
          created_at: user.created_at,
          last_login: user.last_login,
        },
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token, type } = req.query;

    if (!token || !type) {
      return res.status(400).json({
        success: false,
        message: "Verification token and type are required",
      });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: type,
    });

    if (error) {
      console.error("Email verification error:", error);
      return res.status(400).json({
        success: false,
        message: "Email verification failed",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};