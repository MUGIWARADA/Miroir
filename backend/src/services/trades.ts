import type { Db } from '../db/types.js';
import { withIdentity } from '../db/types.js';
import { badRequest, notFound } from '../lib/errors.js';
import { dec, nullableDec, realizedPnl, toNumber } from '../lib/money.js';

export interface EvidenceInput {
  kind: string;
  payload: Record<string, unknown>;
}

export interface TradeCreateInput {
  strategy_version_id: string;
  symbol: string;
  direction: 'long' | 'short';
  quantity: number;
  entry_price: number;
  exit_price?: number;
  fees?: number;
  currency: string;
  opened_at: string;
  closed_at?: string;
  initial_risk_amount?: number;
  evidence?: EvidenceInput[];
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value as string | Date).toISOString();
}

function requiredNumber(value: unknown): number {
  const number = toNumber(value);
  if (number === null) throw new Error('Database returned null for a required trade number');
  return number;
}

function requiredIso(value: unknown): string {
  const timestamp = iso(value);
  if (timestamp === null) throw new Error('Database returned null for a required trade timestamp');
  return timestamp;
}

export function mapTrade(row: any) {
  return {
    id: row.id,
    strategy_version_id: row.strategy_version_id,
    symbol: row.symbol,
    direction: row.direction,
    quantity: requiredNumber(row.quantity),
    entry_price: requiredNumber(row.entry_price),
    exit_price: toNumber(row.exit_price),
    fees: requiredNumber(row.fees),
    currency: row.currency,
    opened_at: requiredIso(row.opened_at),
    closed_at: iso(row.closed_at),
    initial_risk_amount: toNumber(row.initial_risk_amount),
    realized_pnl: toNumber(row.realized_pnl),
    r_multiple: toNumber(row.r_multiple),
    created_at: requiredIso(row.created_at),
    updated_at: requiredIso(row.updated_at),
  };
}

async function assertStrategyVersion(tx: Db, identityId: string, strategyVersionId: string) {
  const result = await tx.query(
    'SELECT id FROM strategy_versions WHERE id = $1 AND identity_id = $2',
    [strategyVersionId, identityId],
  );
  if (!result.rows[0]) notFound('Strategy version not found');
}

async function insertEvidence(
  tx: Db,
  identityId: string,
  tradeId: string,
  evidence: EvidenceInput[],
) {
  for (const item of evidence) {
    await tx.query(
      `INSERT INTO trade_evidence (identity_id, trade_id, kind, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [identityId, tradeId, item.kind, JSON.stringify(item.payload)],
    );
  }
}

export async function insertTradeInTransaction(
  tx: Db,
  identityId: string,
  input: TradeCreateInput,
) {
  const closed = input.closed_at !== undefined || input.exit_price !== undefined;
  if (closed && (input.closed_at === undefined || input.exit_price === undefined)) {
    badRequest('A closed trade requires both exit_price and closed_at');
  }
  if (input.closed_at && new Date(input.closed_at) < new Date(input.opened_at)) {
    badRequest('closed_at cannot be before opened_at');
  }
  const fees = input.fees ?? 0;
  let pnl: string | null = null;
  let rMultiple: string | null = null;
  if (closed) {
    const value = realizedPnl({
      direction: input.direction,
      quantity: input.quantity,
      entry_price: input.entry_price,
      exit_price: input.exit_price as number,
      fees,
    });
    pnl = value.toFixed(10);
    if (input.initial_risk_amount !== undefined) {
      rMultiple = value.div(dec(input.initial_risk_amount)).toFixed(10);
    }
  }

  await assertStrategyVersion(tx, identityId, input.strategy_version_id);
  const result = await tx.query(
    `INSERT INTO trades (
       identity_id, strategy_version_id, symbol, direction, quantity, entry_price,
       exit_price, fees, currency, opened_at, closed_at, initial_risk_amount,
       realized_pnl, r_multiple
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      identityId,
      input.strategy_version_id,
      input.symbol,
      input.direction,
      input.quantity,
      input.entry_price,
      input.exit_price ?? null,
      fees,
      input.currency,
      input.opened_at,
      input.closed_at ?? null,
      input.initial_risk_amount ?? null,
      pnl,
      rMultiple,
    ],
  );
  const trade = result.rows[0];
  await insertEvidence(tx, identityId, trade.id, input.evidence ?? []);
  return mapTrade(trade);
}

export async function createTrade(db: Db, identityId: string, input: TradeCreateInput) {
  return withIdentity(db, identityId, (tx) => insertTradeInTransaction(tx, identityId, input));
}

export async function getTrade(db: Db, identityId: string, tradeId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const result = await tx.query('SELECT * FROM trades WHERE id = $1 AND identity_id = $2', [
      tradeId,
      identityId,
    ]);
    const row = result.rows[0];
    if (!row) notFound('Trade not found');
    const evidence = await tx.query(
      `SELECT id, kind, payload, created_at
       FROM trade_evidence
       WHERE trade_id = $1 AND identity_id = $2
       ORDER BY created_at, id`,
      [tradeId, identityId],
    );
    return { ...mapTrade(row), evidence: evidence.rows };
  });
}

export async function listTrades(
  db: Db,
  identityId: string,
  query: { limit?: number; offset?: number; strategy_version_id?: string },
) {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  return withIdentity(db, identityId, async (tx) => {
    const params: unknown[] = [identityId];
    let where = 'WHERE identity_id = $1';
    if (query.strategy_version_id) {
      params.push(query.strategy_version_id);
      where += ` AND strategy_version_id = $${params.length}`;
    }
    const count = await tx.query(`SELECT COUNT(*)::int AS total FROM trades ${where}`, params);
    params.push(limit, offset);
    const result = await tx.query(
      `SELECT * FROM trades ${where}
       ORDER BY opened_at DESC, id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items: result.rows.map(mapTrade), total: count.rows[0]?.total ?? 0, limit, offset };
  });
}

export async function addTradeEvidence(
  db: Db,
  identityId: string,
  tradeId: string,
  evidence: EvidenceInput,
) {
  return withIdentity(db, identityId, async (tx) => {
    const trade = await tx.query('SELECT id FROM trades WHERE id = $1 AND identity_id = $2', [
      tradeId,
      identityId,
    ]);
    if (!trade.rows[0]) notFound('Trade not found');
    const result = await tx.query(
      `INSERT INTO trade_evidence (identity_id, trade_id, kind, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, kind, payload, created_at`,
      [identityId, tradeId, evidence.kind, JSON.stringify(evidence.payload)],
    );
    await tx.query('UPDATE trades SET updated_at = now() WHERE id = $1 AND identity_id = $2', [
      tradeId,
      identityId,
    ]);
    return result.rows[0];
  });
}

export async function closeTrade(
  db: Db,
  identityId: string,
  tradeId: string,
  input: { exit_price: number; closed_at: string; fees?: number },
) {
  return withIdentity(db, identityId, async (tx) => {
    const result = await tx.query(
      'SELECT * FROM trades WHERE id = $1 AND identity_id = $2 FOR UPDATE',
      [tradeId, identityId],
    );
    const trade = result.rows[0];
    if (!trade) notFound('Trade not found');
    if (trade.closed_at) badRequest('Trade is already closed');
    if (new Date(input.closed_at) < new Date(trade.opened_at)) {
      badRequest('closed_at cannot be before opened_at');
    }
    const fees = input.fees ?? toNumber(trade.fees) ?? 0;
    const pnl = realizedPnl({
      direction: trade.direction,
      quantity: trade.quantity,
      entry_price: trade.entry_price,
      exit_price: input.exit_price,
      fees,
    });
    const risk = nullableDec(trade.initial_risk_amount);
    const rMultiple = risk ? pnl.div(risk).toFixed(10) : null;
    const updated = await tx.query(
      `UPDATE trades
       SET exit_price = $2, closed_at = $3, fees = $4, realized_pnl = $5, r_multiple = $6, updated_at = now()
       WHERE id = $1 AND identity_id = $7
       RETURNING *`,
      [tradeId, input.exit_price, input.closed_at, fees, pnl.toFixed(10), rMultiple, identityId],
    );
    return mapTrade(updated.rows[0]);
  });
}
