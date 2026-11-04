import { loadConfig } from '../config.js';
import { newToken, sha256 } from '../lib/ids.js';
import { seedDemoData } from '../services/demo-data.js';
import { HttpScoringClient } from '../services/scoring-client.js';
import { createDb, createMigrationDb } from './index.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const migrationDb = createMigrationDb(config);
try {
  await migrate(migrationDb);
} finally {
  await migrationDb.close();
}

const db = createDb(config);
const scoring = new HttpScoringClient(config.scoringServiceUrl, config.scoringServiceToken);

try {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  const identity = await db.transaction(async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO identities (mode, display_name) VALUES ('demo', $1) RETURNING id, mode, display_name`,
      ['Seed demo trader'],
    );
    const row = inserted.rows[0];
    await tx.query(
      'INSERT INTO sessions (identity_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [row.id, sha256(token), expiresAt.toISOString()],
    );
    return row;
  });

  try {
    const demoData = await seedDemoData(db, scoring, identity.id);
    console.log(
      JSON.stringify(
        {
          message: 'Seed complete',
          identity,
          token,
          token_type: 'Bearer',
          expires_at: expiresAt.toISOString(),
          ...demoData,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await db.query('DELETE FROM identities WHERE id = $1', [identity.id]);
    throw error;
  }
} finally {
  await db.close();
}
