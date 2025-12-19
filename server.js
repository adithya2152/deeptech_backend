import express from 'express';
import dotenv from 'dotenv';
import pool from './config/db.js';



dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use(
    cors({
        origin:true,
        credentials:true,
    })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-auth-token");
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});


// Test route to check the database connection
app.get("/", async (req, res) => {
  console.log(process.env.PG_HOST);

  try {
    const result = await pool.query("SELECT NOW()"); // Test query to check connection.
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Health check endpoint for API testing
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()"); // Test query to check connection.
    res.json({
      status: "healthy",
      serverTime: result.rows[0].now,
      message: "Server is running and database is connected"
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.use("/api/auth",userAuthRoutes)
