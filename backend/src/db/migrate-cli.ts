import { loadConfig } from '../config.js';
import { createMigrationDb } from './index.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = createMigrationDb(config);
try {
  const applied = await migrate(db);
  if (applied.length === 0) console.log('No new migrations.');
  else console.log(`Applied migrations: ${applied.join(', ')}`);
} finally {
  await db.close();
}
