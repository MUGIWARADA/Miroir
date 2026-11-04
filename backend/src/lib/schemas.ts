import { Type } from '@sinclair/typebox';

export const Uuid = Type.String({ format: 'uuid' });
export const Currency = Type.String({ minLength: 3, maxLength: 10, pattern: '^[A-Z0-9]+$' });
export const DateTime = Type.String({ format: 'date-time' });

export const RuleCheck = Type.Union([
  Type.Object({
    type: Type.Literal('max_risk_amount'),
    amount: Type.Number({ exclusiveMinimum: 0 }),
  }),
  Type.Object({ type: Type.Literal('max_notional'), amount: Type.Number({ exclusiveMinimum: 0 }) }),
  Type.Object({ type: Type.Literal('required_evidence'), field: Type.String({ minLength: 1 }) }),
  Type.Object({
    type: Type.Literal('evidence_equals'),
    field: Type.String({ minLength: 1 }),
    value: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
  }),
]);

export const TradingSchedule = Type.Object({
  days: Type.Array(
    Type.Union([
      Type.Literal('monday'),
      Type.Literal('tuesday'),
      Type.Literal('wednesday'),
      Type.Literal('thursday'),
      Type.Literal('friday'),
      Type.Literal('saturday'),
      Type.Literal('sunday'),
    ]),
    { minItems: 1, maxItems: 7, uniqueItems: true },
  ),
  start_time: Type.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  end_time: Type.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  timezone: Type.String({ minLength: 1 }),
});

export const StrategyRule = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9-]+$' }),
  dimension: Type.Union([
    Type.Literal('risk'),
    Type.Literal('sizing'),
    Type.Literal('plan'),
    Type.Literal('emotion'),
  ]),
  label: Type.String({ minLength: 1, maxLength: 200 }),
  check: RuleCheck,
});

export const StrategyRules = Type.Array(StrategyRule, { minItems: 1, maxItems: 20 });

export const EvidenceInput = Type.Object({
  kind: Type.String({ minLength: 1, maxLength: 64 }),
  payload: Type.Record(Type.String(), Type.Unknown()),
});

export const TradeCreate = Type.Object({
  strategy_version_id: Uuid,
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  direction: Type.Union([Type.Literal('long'), Type.Literal('short')]),
  quantity: Type.Number({ exclusiveMinimum: 0 }),
  entry_price: Type.Number({ exclusiveMinimum: 0 }),
  exit_price: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  fees: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Currency,
  opened_at: DateTime,
  closed_at: Type.Optional(DateTime),
  initial_risk_amount: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  evidence: Type.Optional(Type.Array(EvidenceInput, { maxItems: 20 })),
});

export const TradeCsvPreview = Type.Object({
  strategy_version_id: Uuid,
  csv_text: Type.String({ minLength: 1, maxLength: 800_000 }),
});

export const TradeQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  strategy_version_id: Type.Optional(Uuid),
});

export const StatsQuery = Type.Object({
  currency: Currency,
  strategy_version_id: Type.Optional(Uuid),
  from: Type.Optional(DateTime),
  to: Type.Optional(DateTime),
});

export const ProgressQuery = Type.Object({
  strategy_id: Type.Optional(Uuid),
});
