import 'dotenv/config';
import pg from 'pg';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { MockStore } from './mock-store.js';
import { PostgresStore } from './postgres-store.js';

const config = loadConfig();
let pool;
let store;
if (config.dataMode === 'postgres') {
  pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  await pool.query('SELECT 1');
  store = new PostgresStore(pool, { sessionTtlHours: config.sessionTtlHours });
} else {
  store = new MockStore({ sessionTtlHours: config.sessionTtlHours });
}

const app = await createApp({ store, config });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    if (pool) await pool.end();
    process.exit(0);
  });
}
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  if (pool) await pool.end();
  process.exit(1);
}
