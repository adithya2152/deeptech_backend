import pool from './config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('Running migration: add_expert_scoring_tables.sql');
        
        const migrationPath = path.join(__dirname, 'migrations', 'add_expert_scoring_tables.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await pool.query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('Created tables:');
        console.log('  - expert_documents');
        console.log('  - expert_capability_scores');
        console.log('Added column:');
        console.log('  - experts.vetting_level');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
