import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";
import userAuthRoutes from "./routes/userAuthRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import expertRoutes from "./routes/expertRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import proposalsRoutes from "./routes/proposalsRoutes.js";
import contractsRoutes from "./routes/contractsRoutes.js";
import workLogsRoutes from "./routes/workLogsRoutes.js";
import { initializeStorageBuckets } from "./utils/storage.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Enhanced CORS handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS,PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-auth-token"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

// Health check endpoint for API testing
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "healthy",
      serverTime: result.rows[0].now,
      message: "Server is running and database is connected",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Root endpoint
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "DeepTech Backend API",
      status: "running",
      timestamp: result.rows[0].now,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Authentication routes
app.use("/api/auth", userAuthRoutes);

app.use("/api/experts", expertRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/conversations", messageRoutes);

app.use("/api/proposals", proposalsRoutes);
app.use("/api/contracts", contractsRoutes);
app.use("/api/work-logs", workLogsRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
