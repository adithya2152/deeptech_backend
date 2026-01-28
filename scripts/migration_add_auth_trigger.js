import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: add_auth_user_trigger...');

        await client.query('BEGIN');

        // 1. Create the function with robust name extraction
        const createFunctionQuery = `
      CREATE OR REPLACE FUNCTION public.handle_auth_user_create()
      RETURNS trigger AS $$
      DECLARE
        full_name text;
        first_name_val text;
        last_name_val text;
        avatar_url_val text;
        provider_val text;
      BEGIN
        -- Extract metadata
        full_name := COALESCE(
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'name'
        );
        
        -- Try to get specific name parts first, fallback to splitting full_name
        first_name_val := COALESCE(
          new.raw_user_meta_data->>'given_name',
          new.raw_user_meta_data->>'first_name',
          split_part(full_name, ' ', 1)
        );
        
        last_name_val := COALESCE(
          new.raw_user_meta_data->>'family_name',
          new.raw_user_meta_data->>'last_name',
          NULLIF(substring(full_name from position(' ' in full_name) + 1), '')
        );

        -- Prioritize avatar_url then picture
        avatar_url_val := COALESCE(
          new.raw_user_meta_data->>'avatar_url',
          new.raw_user_meta_data->>'picture'
        );

        provider_val := COALESCE(
            new.raw_app_meta_data->>'provider',
            new.app_metadata->>'provider',
            'email'
        );

        INSERT INTO public.user_accounts (
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          auth_provider,
          email_verified,
          created_at,
          updated_at
        )
        VALUES (
          new.id,
          new.email,
          COALESCE(first_name_val, 'User'),
          COALESCE(last_name_val, ''),
          avatar_url_val,
          provider_val,
          (new.email_confirmed_at IS NOT NULL),
          now(),
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          avatar_url = EXCLUDED.avatar_url,
          email_verified = EXCLUDED.email_verified,
          updated_at = now();

        RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

        await client.query(createFunctionQuery);
        console.log('Function handle_auth_user_create created/updated.');

        // 2. Create the trigger
        // Drop first to avoid errors if it exists
        await client.query('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users');

        const createTriggerQuery = `
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_auth_user_create();
    `;

        await client.query(createTriggerQuery);
        console.log('Trigger on_auth_user_created created.');

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
