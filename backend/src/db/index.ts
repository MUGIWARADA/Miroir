import type { AppConfig } from '../config.js';
import { PgliteDb } from './pglite.js';
import { PostgresDb } from './postgres.js';
import type { Db } from './types.js';

export function createDb(config: Pick<AppConfig, 'databaseUrl' | 'pgliteDir'>): Db {
  if (config.databaseUrl) return new PostgresDb(config.databaseUrl);
  return new PgliteDb(config.pgliteDir);
}

export function createMigrationDb(
  config: Pick<AppConfig, 'databaseUrl' | 'migrationDatabaseUrl' | 'pgliteDir'>,
): Db {
  const url = config.migrationDatabaseUrl ?? config.databaseUrl;
  if (url) return new PostgresDb(url, 1);
  return new PgliteDb(config.pgliteDir);
}

export type { Db } from './types.js';
export { withIdentity } from './types.js';
