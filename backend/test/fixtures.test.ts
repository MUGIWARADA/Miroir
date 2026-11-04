import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FormatRegistry, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  DemoSessionResponseSchema,
  ErrorEnvelopeSchema,
  IdentitySchema,
  ReviewRecordSchema,
  StatsSchema,
  StrategyRecordSchema,
  TradeImportCommitResponseSchema,
  TradeImportPreviewResponseSchema,
  TradeRecordSchema,
} from '../src/lib/api-schemas.js';

FormatRegistry.Set('uuid', (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
);
FormatRegistry.Set(
  'date-time',
  (value) => Number.isFinite(Date.parse(value)) && /(Z|[+-]\d{2}:\d{2})$/i.test(value),
);

const FixtureSchemas = [
  { name: 'demo-session.success.json', schema: DemoSessionResponseSchema },
  { name: 'demo-mode.me.json', schema: Type.Object({ identity: IdentitySchema }) },
  { name: 'strategy-create.success.json', schema: Type.Object({ strategy: StrategyRecordSchema }) },
  { name: 'trade-create.success.json', schema: Type.Object({ trade: TradeRecordSchema }) },
  { name: 'trade-import-preview.success.json', schema: TradeImportPreviewResponseSchema },
  { name: 'trade-import-commit.success.json', schema: TradeImportCommitResponseSchema },
  { name: 'stats.empty.json', schema: Type.Object({ stats: StatsSchema }) },
  {
    name: 'review.missing-evidence.json',
    schema: Type.Object({ cached: Type.Boolean(), review: ReviewRecordSchema }),
  },
  { name: 'validation-error.csv.json', schema: ErrorEnvelopeSchema },
];

test('canonical JSON fixtures match the shared API schemas', async () => {
  for (const { name, schema } of FixtureSchemas) {
    const value: unknown = JSON.parse(
      await readFile(new URL(`../fixtures/api/${name}`, import.meta.url), 'utf8'),
    );
    assert.ok(Value.Check(schema, value), `${name} does not match its API schema`);
  }
});
