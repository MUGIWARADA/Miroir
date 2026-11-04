import { Type } from '@sinclair/typebox';
import { Currency, DateTime, RuleCheck, TradingSchedule, Uuid } from './schemas.js';

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const ErrorDetailSchema = Type.Object({
  row: Type.Optional(Type.Integer({ minimum: 1 })),
  field: Type.Optional(Type.String()),
  message: Type.String(),
});

export const ErrorEnvelopeSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    request_id: Type.String(),
    details: Type.Array(ErrorDetailSchema),
  }),
});

export const errorResponses = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
  413: ErrorEnvelopeSchema,
  415: ErrorEnvelopeSchema,
  422: ErrorEnvelopeSchema,
  429: ErrorEnvelopeSchema,
  500: ErrorEnvelopeSchema,
  502: ErrorEnvelopeSchema,
  503: ErrorEnvelopeSchema,
};

const LegacyWindowCheck = Type.Object({
  type: Type.Literal('trading_window'),
  start: Type.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  end: Type.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  weekdays: Type.Optional(Type.Array(Type.Integer({ minimum: 0, maximum: 6 }))),
  timezone: Type.Optional(Type.String()),
});

const StoredRule = Type.Object({
  id: Type.String(),
  dimension: Type.Union([
    Type.Literal('risk'),
    Type.Literal('sizing'),
    Type.Literal('plan'),
    Type.Literal('timing'),
    Type.Literal('emotion'),
  ]),
  label: Type.String(),
  check: Type.Union([RuleCheck, LegacyWindowCheck]),
});

export const IdentitySchema = Type.Object({
  id: Uuid,
  mode: Type.Union([Type.Literal('demo'), Type.Literal('verified')]),
  display_name: Type.String(),
});

export const DemoSessionResponseSchema = Type.Object({
  token: Type.String(),
  token_type: Type.Literal('Bearer'),
  expires_at: DateTime,
  identity: IdentitySchema,
  demo_data: Type.Object({
    strategy_id: Uuid,
    strategy_version_id: Uuid,
    trade_count: Type.Integer({ minimum: 0 }),
    review_count: Type.Integer({ minimum: 0 }),
  }),
});

export const StrategyRecordSchema = Type.Object({
  id: Uuid,
  identity_id: Uuid,
  name: Type.String(),
  draft_rules: Type.Array(StoredRule),
  draft_trading_schedule: Type.Union([TradingSchedule, Type.Null()]),
  current_version_id: Type.Union([Uuid, Type.Null()]),
  created_at: DateTime,
  updated_at: DateTime,
});

export const StrategyVersionSchema = Type.Object({
  id: Uuid,
  identity_id: Uuid,
  strategy_id: Uuid,
  version_number: Type.Integer({ minimum: 1 }),
  rules: Type.Array(StoredRule),
  trading_schedule: Type.Union([TradingSchedule, Type.Null()]),
  confirmed_at: DateTime,
});

export const EvidenceRecordSchema = Type.Object({
  id: Uuid,
  kind: Type.String(),
  payload: Type.Record(Type.String(), Type.Unknown()),
  created_at: DateTime,
});

export const TradeRecordSchema = Type.Object({
  id: Uuid,
  strategy_version_id: Uuid,
  symbol: Type.String(),
  direction: Type.Union([Type.Literal('long'), Type.Literal('short')]),
  quantity: Type.Number(),
  entry_price: Type.Number(),
  exit_price: NullableNumber,
  fees: Type.Number(),
  currency: Currency,
  opened_at: DateTime,
  closed_at: Type.Union([DateTime, Type.Null()]),
  initial_risk_amount: NullableNumber,
  realized_pnl: NullableNumber,
  r_multiple: NullableNumber,
  created_at: DateTime,
  updated_at: DateTime,
});

export const TradeWithEvidenceSchema = Type.Intersect([
  TradeRecordSchema,
  Type.Object({ evidence: Type.Array(EvidenceRecordSchema) }),
]);

export const TradeImportPreviewRowSchema = Type.Object({
  row_number: Type.Integer({ minimum: 2 }),
  strategy_version_id: Uuid,
  symbol: Type.String(),
  direction: Type.Union([Type.Literal('long'), Type.Literal('short')]),
  quantity: Type.Number({ exclusiveMinimum: 0 }),
  entry_price: Type.Number({ exclusiveMinimum: 0 }),
  exit_price: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  fees: Type.Number({ minimum: 0 }),
  currency: Currency,
  opened_at: DateTime,
  closed_at: Type.Optional(DateTime),
  initial_risk_amount: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  evidence: Type.Array(
    Type.Object({
      kind: Type.String(),
      payload: Type.Record(Type.String(), Type.Unknown()),
    }),
  ),
});

export const TradeImportPreviewResponseSchema = Type.Object({
  import_id: Uuid,
  status: Type.Literal('ready'),
  row_count: Type.Integer({ minimum: 1, maximum: 500 }),
  rows: Type.Array(TradeImportPreviewRowSchema, { minItems: 1, maxItems: 500 }),
});

export const TradeImportCommitResponseSchema = Type.Object({
  import_id: Uuid,
  status: Type.Literal('committed'),
  imported_count: Type.Integer({ minimum: 1, maximum: 500 }),
  trades: Type.Array(TradeRecordSchema, { minItems: 1, maxItems: 500 }),
  cached: Type.Boolean(),
});

export const RuleResultSchema = Type.Object({
  rule_id: Type.String(),
  dimension: Type.Union([
    Type.Literal('risk'),
    Type.Literal('sizing'),
    Type.Literal('plan'),
    Type.Literal('timing'),
    Type.Literal('emotion'),
  ]),
  label: Type.String(),
  status: Type.Union([
    Type.Literal('followed'),
    Type.Literal('broken'),
    Type.Literal('cannot_assess'),
  ]),
  reason: Type.String(),
});

export const ScoringResponseSchema = Type.Object({
  request_id: Type.String(),
  scoring_version: Type.String(),
  strategy_version_id: Type.String(),
  trade_id: Type.String(),
  decision_quality_score: NullableNumber,
  coverage_pct: Type.Number(),
  dimensions: Type.Array(
    Type.Object({
      dimension: Type.Union([
        Type.Literal('risk'),
        Type.Literal('sizing'),
        Type.Literal('plan'),
        Type.Literal('timing'),
        Type.Literal('emotion'),
      ]),
      status: Type.Union([
        Type.Literal('followed'),
        Type.Literal('broken'),
        Type.Literal('cannot_assess'),
      ]),
      score_pct: NullableNumber,
      weight: Type.Number(),
      assessable_weight: Type.Number(),
      earned_weight: Type.Number(),
      rules: Type.Array(RuleResultSchema),
    }),
  ),
  coaching: Type.Object({
    mode: Type.Literal('rule_based'),
    summary: Type.String(),
    actions: Type.Array(Type.String()),
  }),
  warnings: Type.Array(Type.String()),
});

export const ReviewRecordSchema = Type.Object({
  id: Uuid,
  identity_id: Uuid,
  trade_id: Uuid,
  strategy_version_id: Uuid,
  input_hash: Type.String(),
  scoring_version: Type.String(),
  decision_quality_score: NullableString,
  coverage_pct: Type.String(),
  result: ScoringResponseSchema,
  created_at: DateTime,
});

export const StatsSchema = Type.Object({
  currency: Currency,
  timezone: Type.String(),
  sample_size: Type.Integer(),
  wins: Type.Integer(),
  losses: Type.Integer(),
  breakeven: Type.Integer(),
  win_rate: NullableNumber,
  net_realized_pnl: Type.Number(),
  gross_profit: Type.Number(),
  gross_loss: Type.Number(),
  total_fees: Type.Number(),
  average_win: NullableNumber,
  average_loss: NullableNumber,
  payoff_ratio: NullableNumber,
  profit_factor: NullableNumber,
  expectancy: NullableNumber,
  average_r_multiple: NullableNumber,
  cumulative_realized_pnl_curve: Type.Array(
    Type.Object({
      trade_id: Uuid,
      closed_at: DateTime,
      cumulative_realized_pnl: Type.Number(),
    }),
  ),
});

const TrendSchema = Type.Union([
  Type.Object({
    eligible: Type.Literal(true),
    direction: Type.Union([
      Type.Literal('improving'),
      Type.Literal('declining'),
      Type.Literal('flat'),
    ]),
    slope_per_trade: Type.Number(),
    sample_size: Type.Integer(),
  }),
  Type.Object({
    eligible: Type.Literal(false),
    reason: Type.String(),
    sample_size: Type.Integer(),
  }),
]);

export const ProgressSchema = Type.Object({
  versions: Type.Array(
    Type.Object({
      strategy_id: Uuid,
      strategy_version_id: Uuid,
      version_number: Type.Integer(),
      reviewed_trades: Type.Integer(),
      assessed_trades: Type.Integer(),
      unassessed_trades: Type.Integer(),
      average_decision_quality_score: NullableNumber,
      average_coverage_pct: NullableNumber,
      dimension_counts: Type.Record(Type.String(), Type.Record(Type.String(), Type.Integer())),
      trend: TrendSchema,
    }),
  ),
});
