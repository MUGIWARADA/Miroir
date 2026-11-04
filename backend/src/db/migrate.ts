import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const migrationsDir = path.resolve(here, '../../migrations');

export async function migrate(db: Db, dir: string = migrationsDir): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    const exists = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (exists.rows.length > 0) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
