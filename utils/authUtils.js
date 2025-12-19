import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRY || "24h";
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// Hash password
export const hashPassword = async (password) => {
  try {
    const salt = await bcryptjs.genSalt(10);
    return await bcryptjs.hash(password, salt);
  } catch (error) {
    throw new Error(`Error hashing password: ${error.message}`);
  }
};

// Compare password with hash
export const comparePassword = async (password, hash) => {
  try {
    return await bcryptjs.compare(password, hash);
  } catch (error) {
    throw new Error(`Error comparing password: ${error.message}`);
  }
};

// Generate access token
export const generateAccessToken = (userId, email, role = "buyer") => {
  return jwt.sign(
    {
      id: userId,
      email,
      role,
      type: "access",
    },
    jwtSecret,
    { expiresIn: jwtExpiry }
  );
};

// Generate refresh token
export const generateRefreshToken = (userId, email) => {
  return jwt.sign(
    {
      id: userId,
      email,
      type: "refresh",
    },
    jwtSecret,
    { expiresIn: refreshTokenExpiry }
  );
};

// Generate both tokens
export const generateTokens = (userId, email, role = "buyer") => {
  return {
    accessToken: generateAccessToken(userId, email, role),
    refreshToken: generateRefreshToken(userId, email),
  };
};

// Verify token
export const verifyToken = (token, type = "access") => {
  try {
    const decoded = jwt.verify(token, jwtSecret);

    if (type && decoded.type !== type) {
      throw new Error(
        `Invalid token type. Expected ${type}, got ${decoded.type}`
      );
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

// Decode token without verification (use with caution)
export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error(`Error decoding token: ${error.message}`);
  }
};

// Check if token is expired
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;

    return Date.now() >= decoded.exp * 1000;
  } catch (error) {
    return true;
  }
};

// Format response
export const formatResponse = (
  success,
  message,
  data = null,
  errors = null
) => {
  const response = {
    success,
    message,
  };

  if (data) response.data = data;
  if (errors) response.errors = errors;

  return response;
};

// Standard error response
export const errorResponse = (message, statusCode = 500, errors = null) => {
  return {
    statusCode,
    body: formatResponse(false, message, null, errors),
  };
};

// Standard success response
export const successResponse = (message, data = null, statusCode = 200) => {
  return {
    statusCode,
    body: formatResponse(true, message, data),
  };
};

// Validate email format
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
export const validatePasswordStrength = (password) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const strength = Object.values(requirements).filter(Boolean).length;

  return {
    isStrong: strength >= 4,
    strength,
    requirements,
    feedback: getPasswordFeedback(requirements),
  };
};

// Get password feedback
const getPasswordFeedback = (requirements) => {
  const feedback = [];

  if (!requirements.minLength)
    feedback.push("Password must be at least 8 characters");
  if (!requirements.hasUpperCase)
    feedback.push("Password must contain uppercase letter");
  if (!requirements.hasLowerCase)
    feedback.push("Password must contain lowercase letter");
  if (!requirements.hasNumbers) feedback.push("Password must contain number");
  if (!requirements.hasSpecialChar)
    feedback.push("Password must contain special character");

  return feedback;
};

// Generate OTP
export const generateOTP = (length = 6) => {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

// Verify OTP
export const verifyOTP = (otp, storedOTP, expiryTime) => {
  if (!otp || !storedOTP) return false;
  if (otp !== storedOTP) return false;
  if (Date.now() > expiryTime) return false;
  return true;
};
