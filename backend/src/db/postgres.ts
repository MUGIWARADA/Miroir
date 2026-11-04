import pg from 'pg';
import type { Db, QueryResult } from './types.js';

export class PostgresDb implements Db {
  readonly kind = 'postgres' as const;
  private pool: pg.Pool;

  constructor(connectionString: string, max = 10) {
    this.pool = new pg.Pool({ connectionString, max });
  }

  async query<T = any>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params as any[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Db = {
      kind: 'postgres',
      query: async <R = any>(sql: string, params: unknown[] = []) => {
        const result = await client.query(sql, params as any[]);
        return { rows: result.rows as R[], rowCount: result.rowCount ?? result.rows.length };
      },
      exec: async (sql: string) => {
        await client.query(sql);
      },
      transaction: async () => {
        throw new Error('Nested transactions are not supported');
      },
      close: async () => {
        client.release();
      },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
