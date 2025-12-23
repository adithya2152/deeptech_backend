import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_CONNECTION_STRING, 
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true, 
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle PostgreSQL client:", err.message);
});

const checkConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database Connected Successfully');
    client.release();
  } catch (err) {
    console.error('❌ Database Connection Failed:', err.message);
  }
};

checkConnection();

export default pool;