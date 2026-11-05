import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiAdapter } from '../src/ai-adapter.js';
import { DEMO_STRATEGY } from '../src/fixtures.js';
import { evaluateTrade } from '../src/scoring.js';

test('AI adapter placeholder is explicit and does not change deterministic scores', async () => {
  const trade = {
    risk_amount: 50, quantity: 1, entry_price: 100, opened_at: '2026-11-04T10:00:00.000Z',
    evidence: [{ kind: 'note', payload: { setup_note: 'sample' } }, { kind: 'state', payload: { emotional_state: 'calm' } }]
  };
  const deterministic = evaluateTrade(trade, DEMO_STRATEGY);
  const ai = await createAiAdapter().explain({ trade, review: deterministic });
  assert.deepEqual(ai, { status: 'not_configured' });
  assert.equal(deterministic.decision_quality_score, 100);
});

test('future AI providers can add bounded explanation only; score fields are ignored', async () => {
  const deterministic = { decision_quality_score: 80, coverage_pct: 75, dimensions: [] };
  const adapter = createAiAdapter({ explain: async () => ({ summary: 'Explanation', actions: ['One step'], decision_quality_score: 0 }) });
  const explanation = await adapter.explain({ trade: {}, review: deterministic });
  assert.deepEqual(explanation, { status: 'available', summary: 'Explanation', actions: ['One step'] });
  assert.equal(deterministic.decision_quality_score, 80);
});
