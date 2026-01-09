import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

const auth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access Denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    const query = 'SELECT is_banned, ban_reason FROM profiles WHERE id = $1';
    const { rows } = await pool.query(query, [decoded.id]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (rows[0].is_banned) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended.",
        reason: rows[0].ban_reason,
        code: "USER_BANNED"
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth Error: ", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid Token.",
      code: "INVALID_TOKEN",
    });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      req.user = {
        id: decoded.id || decoded.userId,
        ...decoded,
      };
    } catch (err) {
      console.error("JWT Verification Error: ", err.message);
    }
  }

  next();
};

export { auth, optionalAuth };
