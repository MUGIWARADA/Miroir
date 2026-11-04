import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { HttpScoringClient } from './services/scoring-client.js';

const config = loadConfig();
const db = createDb(config);
const scoring = new HttpScoringClient(config.scoringServiceUrl, config.scoringServiceToken);
const app = await buildApp({ config, db, scoring });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Miroir API listening on ${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  await db.close();
  process.exit(1);
}
