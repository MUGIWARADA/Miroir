import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db, QueryResult } from './types.js';

export class PgliteDb implements Db {
  readonly kind = 'pglite' as const;
  private db: PGlite;

  constructor(dataDir?: string) {
    if (dataDir) mkdirSync(dataDir, { recursive: true });
    this.db = dataDir ? new PGlite(dataDir) : new PGlite();
  }

  async query<T = any>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.db.query(sql, params as any[]);
    return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (inner) => {
      const tx: Db = {
        kind: 'pglite',
        query: async <R = any>(sql: string, params: unknown[] = []) => {
          const result = await inner.query(sql, params as any[]);
          return { rows: result.rows as R[], rowCount: result.affectedRows ?? result.rows.length };
        },
        exec: async (sql: string) => {
          await inner.exec(sql);
        },
        transaction: async () => {
          throw new Error('Nested transactions are not supported');
        },
        close: async () => {},
      };
      return fn(tx);
    });
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
