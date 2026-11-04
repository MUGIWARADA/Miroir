import type { Db } from '../db/types.js';
import { createReview } from './reviews.js';
import type { ScoringClient } from './scoring-client.js';
import { confirmStrategy, createStrategy } from './strategies.js';
import type { TradingScheduleInput } from './strategies.js';
import { createTrade } from './trades.js';
import type { TradeCreateInput } from './trades.js';

const demoRules = [
  {
    id: 'risk-limit',
    dimension: 'risk',
    label: 'Risk at most 100 USD per trade',
    check: { type: 'max_risk_amount', amount: 100 },
  },
  {
    id: 'size-limit',
    dimension: 'sizing',
    label: 'Position notional at most 10000 USD',
    check: { type: 'max_notional', amount: 10000 },
  },
  {
    id: 'setup-note',
    dimension: 'plan',
    label: 'Record a setup note before entry',
    check: { type: 'required_evidence', field: 'setup_note' },
  },
  {
    id: 'calm-state',
    dimension: 'emotion',
    label: 'Explicitly record a calm emotional state',
    check: { type: 'evidence_equals', field: 'emotional_state', value: 'calm' },
  },
];

const demoSchedule: TradingScheduleInput = {
  days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  start_time: '08:00',
  end_time: '16:00',
  timezone: 'UTC',
};

interface DemoTradeSample extends Omit<TradeCreateInput, 'strategy_version_id'> {
  expected: string;
}

const demoTrades: DemoTradeSample[] = [
  {
    symbol: 'AAPL',
    currency: 'USD',
    direction: 'long',
    quantity: 50,
    entry_price: 100,
    exit_price: 104,
    fees: 2,
    initial_risk_amount: 80,
    opened_at: '2026-10-05T09:15:00Z',
    closed_at: '2026-10-05T11:00:00Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Breakout above premarket high with volume.' } },
      { kind: 'state', payload: { emotional_state: 'calm' } },
    ],
    expected: 'followed rules, winning trade',
  },
  {
    symbol: 'MSFT',
    currency: 'USD',
    direction: 'long',
    quantity: 80,
    entry_price: 100,
    exit_price: 103,
    fees: 2,
    initial_risk_amount: 150,
    opened_at: '2026-10-06T10:00:00Z',
    closed_at: '2026-10-06T12:30:00Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Oversized position after a win.' } },
      { kind: 'state', payload: { emotional_state: 'calm' } },
    ],
    expected: 'broken risk rule, still winning trade',
  },
  {
    symbol: 'NVDA',
    currency: 'USD',
    direction: 'short',
    quantity: 20,
    entry_price: 200,
    exit_price: 195,
    fees: 3,
    initial_risk_amount: 90,
    opened_at: '2026-10-07T14:00:00Z',
    closed_at: '2026-10-07T15:00:00Z',
    evidence: [{ kind: 'note', payload: { setup_note: 'Failed breakout short.' } }],
    expected: 'missing emotion evidence, winning trade',
  },
  {
    symbol: 'TSLA',
    currency: 'USD',
    direction: 'long',
    quantity: 30,
    entry_price: 150,
    exit_price: 147,
    fees: 2,
    initial_risk_amount: 75,
    opened_at: '2026-10-08T08:30:00Z',
    closed_at: '2026-10-08T09:45:00Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Valid pullback, stopped out.' } },
      { kind: 'state', payload: { emotional_state: 'calm' } },
    ],
    expected: 'followed rules, losing trade',
  },
  {
    symbol: 'AMZN',
    currency: 'USD',
    direction: 'long',
    quantity: 40,
    entry_price: 120,
    exit_price: 118,
    fees: 2,
    initial_risk_amount: 70,
    opened_at: '2026-10-09T18:30:00Z',
    closed_at: '2026-10-09T19:30:00Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Late session chase.' } },
      { kind: 'state', payload: { emotional_state: 'impulsive' } },
    ],
    expected: 'broken timing and emotion, losing trade',
  },
  {
    symbol: 'META',
    currency: 'USD',
    direction: 'long',
    quantity: 25,
    entry_price: 180,
    exit_price: 186,
    fees: 2,
    initial_risk_amount: 95,
    opened_at: '2026-10-12T09:00:00Z',
    closed_at: '2026-10-12T10:30:00Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Clean opening range breakout.' } },
      { kind: 'state', payload: { emotional_state: 'calm' } },
    ],
    expected: 'followed rules, winning trade',
  },
];

export async function seedDemoData(db: Db, scoring: ScoringClient, identityId: string) {
  const strategy = await createStrategy(db, identityId, {
    name: 'Demo breakout plan',
    rules: demoRules,
    trading_schedule: demoSchedule,
  });
  const version = await confirmStrategy(db, identityId, strategy.id);

  const trades = [];
  for (const sample of demoTrades) {
    const { expected, ...input } = sample;
    const trade = await createTrade(db, identityId, {
      ...input,
      strategy_version_id: version.id,
    });
    trades.push({ trade, expected });
  }

  let reviewsCreated = 0;
  for (const item of trades) {
    await createReview({ db, scoring }, identityId, item.trade.id);
    reviewsCreated += 1;
  }

  return {
    strategy_id: strategy.id,
    strategy_version_id: version.id,
    trade_count: trades.length,
    review_count: reviewsCreated,
    trades: trades.map(({ trade, expected }) => ({ id: trade.id, symbol: trade.symbol, expected })),
  };
}
