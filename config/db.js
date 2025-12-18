// db.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false, // Required by Supabase
  },
  max: 10, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // Client idle time before being closed (30s)
  connectionTimeoutMillis: 5000, // Wait time for new connection before error
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
  // Don't exit here unless you want the app to crash; just log it
  // process.exit(-1);
});

module.exports = pool;
