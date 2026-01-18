import pool from '../config/db.js';

const run = async () => {
    try {
        console.log("Updating contracts_nda_status_check constraint...");

        // Find the constraint name (it might be contracts_nda_status_check or auto-generated)
        // We will try to find it by querying pg_constraint
        const findConstraintQuery = `
            SELECT conname
            FROM pg_constraint
            JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
            WHERE pg_class.relname = 'contracts'
            AND pg_get_constraintdef(pg_constraint.oid) LIKE '%nda_status%';
        `;

        const { rows } = await pool.query(findConstraintQuery);

        if (rows.length > 0) {
            const constraintName = rows[0].conname;
            console.log(`Found constraint: ${constraintName}`);

            await pool.query(`ALTER TABLE contracts DROP CONSTRAINT "${constraintName}";`);
            console.log(`Dropped constraint: ${constraintName}`);
        } else {
            console.log("No existing constraint found matching pattern, proceeding to add new one.");
        }

        await pool.query(`
            ALTER TABLE contracts 
            ADD CONSTRAINT contracts_nda_status_check 
            CHECK (nda_status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text, 'skipped'::text]));
        `);

        console.log("Added new constraint with 'skipped' allowed.");
        process.exit();
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
};

run();
