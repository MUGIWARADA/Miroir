export const DEMO_STRATEGY = {
  id: '03ecfa74-f489-4ac8-93dc-325f72544eb9',
  name: 'Demo Breakout Plan',
  description: 'Demo Breakout Plan for disciplined execution',
  status: 'confirmed',
  markets: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  timeframes: ['15m', '1h', '4h'],
  entry_conditions: ['Breakout above key horizontal resistance on 4h timeframe with volume spike'],
  stop_loss_method: { type: 'swing_low', description: 'Placed below previous 1h swing low' },
  exit_plan: { type: 'trailing_or_target', description: 'Take 50% at 2R, trail remainder behind 1h structure' },
  risk_rules: [{ id: 'risk-limit', dimension: 'risk', label: 'Risk at most 100 USD per trade', check: { type: 'max_risk_amount', amount: 100 } }],
  position_sizing_rules: [{ id: 'size-limit', dimension: 'sizing', label: 'Position notional at most 10000 USD', check: { type: 'max_notional', amount: 10000 } }],
  other_restrictions: ['No new entries 15 minutes before or after high-impact macroeconomic news'],
  preferences: ['Prefer trading during London / New York overlap session (13:00 - 16:00 UTC)'],
  draft_rules: [
    { id: 'risk-limit', dimension: 'risk', label: 'Risk at most 100 USD per trade', check: { type: 'max_risk_amount', amount: 100 } },
    { id: 'size-limit', dimension: 'sizing', label: 'Position notional at most 10000 USD', check: { type: 'max_notional', amount: 10000 } },
    { id: 'setup-note', dimension: 'plan', label: 'Record a setup note before entry', check: { type: 'required_evidence', field: 'setup_note' } },
    { id: 'calm-state', dimension: 'emotion', label: 'Explicitly record a calm emotional state', check: { type: 'evidence_equals', field: 'emotional_state', value: 'calm' } }
  ],
  draft_trading_schedule: {
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    start_time: '08:00',
    end_time: '16:00',
    timezone: 'UTC'
  },
  current_version_id: '2f580be1-6424-492e-80f3-306f04677d2a',
  version_number: 1
};

export const DEMO_STATS = {
  currency: 'USD',
  sample_size: 1,
  wins: 1,
  losses: 0,
  win_rate: 100,
  net_realized_pnl: 100,
  profit_factor: null,
  expectancy: 100,
  cumulative_realized_pnl_curve: [
    { trade_id: 'demo-trade-1', closed_at: '2026-11-04T12:00:00.000Z', cumulative_realized_pnl: 100 }
  ]
};

export const DEMO_ROQQU_BALANCES = {
  balance: { btc: 0.002, eth: 0.15, usdt: 250, updated_at: '2026-11-05T00:00:00.000Z' }
};

export const DEMO_ROQQU_HISTORY = {
  history: [
    { id: 'sample-ledger-1', token: 'usdt', amount: 250, direction: 'credit', status: 1, created_at: '2026-11-04T12:00:00.000Z' },
    { id: 'sample-ledger-2', token: 'eth', amount: 0.15, direction: 'credit', status: 1, created_at: '2026-11-03T09:30:00.000Z' }
  ]
};
