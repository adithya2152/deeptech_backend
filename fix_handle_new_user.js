
import pool from './config/db.js';

const fixTrigger = async () => {
    try {
        console.log('Replacing handle_new_user function...');

        const query = `
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        INSERT INTO public.user_accounts (id, email, role)
        VALUES (NEW.id, NEW.email, 'buyer')
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail the transaction if possible, 
        -- or raise a cleaner error.
        -- For now, just raise it so we see it, but the fix above should prevent errors.
        RAISE EXCEPTION 'Database error saving new user: %', SQLERRM;
      END;
      $$;
    `;

        await pool.query(query);
        console.log('Successfully updated handle_new_user function.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to update function:', error);
        process.exit(1);
    }
};

fixTrigger();
