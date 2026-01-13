
import pool from './config/db.js';

const inspectAuth = async () => {
    try {
        console.log('Listing triggers on auth.users...');
        const trigRes = await pool.query(`
      SELECT trigger_name, action_statement, event_manipulation 
      FROM information_schema.triggers 
      WHERE event_object_schema = 'auth' AND event_object_table = 'users'
    `);
        console.table(trigRes.rows);

        console.log('\nListing functions in public schema (potential trigger handlers)...');
        const funcRes = await pool.query(`
      SELECT p.proname, p.prosrc 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public'
    `);

        // Print source of any function that looks like a user handler
        funcRes.rows.forEach(r => {
            if (r.proname.includes('user') || r.proname.includes('handle') || r.proname.includes('trigger')) {
                console.log(`\n--- Function: ${r.proname} ---`);
                console.log(r.prosrc);
            }
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

inspectAuth();
