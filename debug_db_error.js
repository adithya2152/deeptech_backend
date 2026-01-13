
import pool from './config/db.js';

const searchFunctions = async () => {
    try {
        console.log('Searching for error message in database functions...');

        // Search in function source code
        const query = `
      SELECT n.nspname as schema, p.proname as function_name, p.prosrc as source_code
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.prosrc ILIKE '%Database error saving new user%';
    `;

        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log('No functions found containing that error message.');

            // Fallback: List all triggers on auth.users (if accessible) or just list all triggers in public
            console.log('Listing all triggers in public schema...');
            const triggerQuery = `
        SELECT event_object_table, trigger_name, action_statement 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'public';
      `;
            const triggers = await pool.query(triggerQuery);
            console.table(triggers.rows);
        } else {
            console.log('Found function(s):');
            rows.forEach(r => {
                console.log(`\nSchema: ${r.schema}, Function: ${r.function_name}`);
                console.log('Source snippet:');
                console.log(r.source_code);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Search failed:', error);
        process.exit(1);
    }
};

searchFunctions();
