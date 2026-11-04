import type { Db } from '../db/types.js';
import { withIdentity } from '../db/types.js';
import { badRequest, notFound } from '../lib/errors.js';

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TradingScheduleInput {
  days: Weekday[];
  start_time: string;
  end_time: string;
  timezone: string;
}

export interface StrategyInput {
  name: string;
  rules: unknown[];
  trading_schedule?: TradingScheduleInput | null;
}

function validateTradingSchedule(schedule?: TradingScheduleInput | null): void {
  if (!schedule) return;
  if (schedule.start_time === schedule.end_time) {
    badRequest('Trading schedule start_time and end_time must be different');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone }).format(new Date());
  } catch {
    badRequest('Use a valid timezone name, for example Africa/Lagos');
  }
}

export async function createStrategy(db: Db, identityId: string, input: StrategyInput) {
  validateTradingSchedule(input.trading_schedule);
  return withIdentity(db, identityId, async (tx) => {
    const result = await tx.query(
      `INSERT INTO strategies (identity_id, name, draft_rules, draft_trading_schedule)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       RETURNING *`,
      [
        identityId,
        input.name,
        JSON.stringify(input.rules),
        JSON.stringify(input.trading_schedule ?? null),
      ],
    );
    return result.rows[0];
  });
}

export async function listStrategies(db: Db, identityId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const result = await tx.query(
      'SELECT * FROM strategies WHERE identity_id = $1 ORDER BY created_at DESC, id',
      [identityId],
    );
    return result.rows;
  });
}

export async function getStrategy(db: Db, identityId: string, strategyId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const result = await tx.query('SELECT * FROM strategies WHERE id = $1 AND identity_id = $2', [
      strategyId,
      identityId,
    ]);
    const row = result.rows[0];
    if (!row) notFound('Strategy not found');
    return row;
  });
}

export async function updateStrategyDraft(
  db: Db,
  identityId: string,
  strategyId: string,
  input: Partial<StrategyInput>,
) {
  if (
    input.name === undefined &&
    input.rules === undefined &&
    input.trading_schedule === undefined
  ) {
    badRequest('Provide name, rules, or trading_schedule to update');
  }
  validateTradingSchedule(input.trading_schedule);
  return withIdentity(db, identityId, async (tx) => {
    const existing = await tx.query('SELECT * FROM strategies WHERE id = $1 AND identity_id = $2', [
      strategyId,
      identityId,
    ]);
    const row = existing.rows[0];
    if (!row) notFound('Strategy not found');
    const name = input.name ?? row.name;
    const rules = input.rules ?? row.draft_rules;
    const schedule =
      input.trading_schedule === undefined ? row.draft_trading_schedule : input.trading_schedule;
    const result = await tx.query(
      `UPDATE strategies
       SET name = $2, draft_rules = $3::jsonb, draft_trading_schedule = $4::jsonb, updated_at = now()
       WHERE id = $1 AND identity_id = $5
       RETURNING *`,
      [strategyId, name, JSON.stringify(rules), JSON.stringify(schedule ?? null), identityId],
    );
    return result.rows[0];
  });
}

export async function confirmStrategy(db: Db, identityId: string, strategyId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const locked = await tx.query(
      'SELECT * FROM strategies WHERE id = $1 AND identity_id = $2 FOR UPDATE',
      [strategyId, identityId],
    );
    const strategy = locked.rows[0];
    if (!strategy) notFound('Strategy not found');
    const rules = strategy.draft_rules;
    if (!Array.isArray(rules) || rules.length === 0) badRequest('Strategy has no rules to confirm');
    const tradingSchedule = strategy.draft_trading_schedule ?? null;

    const versionResult = await tx.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM strategy_versions
       WHERE strategy_id = $1 AND identity_id = $2`,
      [strategyId, identityId],
    );
    const nextVersion = Number(versionResult.rows[0]?.max_version ?? 0) + 1;
    const inserted = await tx.query(
      `INSERT INTO strategy_versions (
         identity_id, strategy_id, version_number, rules, trading_schedule
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING *`,
      [identityId, strategyId, nextVersion, JSON.stringify(rules), JSON.stringify(tradingSchedule)],
    );
    const version = inserted.rows[0];
    await tx.query(
      'UPDATE strategies SET current_version_id = $2, updated_at = now() WHERE id = $1 AND identity_id = $3',
      [strategyId, version.id, identityId],
    );
    return version;
  });
}

export async function listStrategyVersions(db: Db, identityId: string, strategyId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const strategy = await tx.query(
      'SELECT id FROM strategies WHERE id = $1 AND identity_id = $2',
      [strategyId, identityId],
    );
    if (!strategy.rows[0]) notFound('Strategy not found');
    const result = await tx.query(
      `SELECT * FROM strategy_versions
       WHERE strategy_id = $1 AND identity_id = $2
       ORDER BY version_number DESC`,
      [strategyId, identityId],
    );
    return result.rows;
  });
}
