import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');
const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = fileURLToPath(new URL('../db/migrations', import.meta.url));

try {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = await readFile(filePath, 'utf8');
    await pool.query(sql);
    console.log(`Applied migration: ${file}`);
  }
  console.log('All database migrations applied successfully.');
} finally {
  await pool.end();
}
