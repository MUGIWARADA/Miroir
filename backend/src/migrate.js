import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');
const pool = new Pool({ connectionString: databaseUrl });
const migrationPath = fileURLToPath(new URL('../db/migrations/001_initial.sql', import.meta.url));
try {
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
  console.log('Database migrations applied.');
} finally {
  await pool.end();
}
