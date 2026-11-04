export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  readonly kind: 'postgres' | 'pglite';
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function withIdentity<T>(
  db: Db,
  identityId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Transaction-local setting: safe with Neon/PgBouncer transaction pooling.
    await tx.query("SELECT set_config('app.identity_id', $1, true)", [identityId]);
    return fn(tx);
  });
}
