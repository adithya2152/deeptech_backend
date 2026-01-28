import pool from '../config/db.js';

const migrate = async () => {
    try {
        console.log('Starting migration: Adding username to profiles...');

        // 1. Add username column if not exists
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='username') THEN 
                    ALTER TABLE profiles ADD COLUMN username text;
                    -- Add unique constraint per profile type? Or globally unique? 
                    -- User request: "give a thing to enter username for both buyers and experts"
                    -- This implies they might be different. 
                    -- Let's make it unique across all profiles to be safe for now, 
                    -- or maybe just unique per profile?
                    -- "change the username coumn from user_accounts table to profiles table"
                    -- Let's stick to simple text first.
                END IF;
            END $$;
        `);
        console.log('Column checks completed.');

        // 2. Migrate existing usernames
        const { rows: users } = await pool.query('SELECT id, username FROM user_accounts WHERE username IS NOT NULL');
        console.log(`Found ${users.length} users to migrate.`);

        for (const user of users) {
            // Update all profiles for this user to have the same username initially
            await pool.query('UPDATE profiles SET username = $1 WHERE user_id = $2 AND username IS NULL', [user.username, user.id]);
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
