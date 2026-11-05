import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrade } from '../src/scoring.js';
import { createAiAdapter, createOpenRouterProvider } from '../src/ai-adapter.js';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { DEMO_STRATEGY } from '../src/fixtures.js';

test('Trade Review: followed rules produce positive evaluation with score 100', () => {
  const trade = {
    symbol: 'BTC/USDT',
    direction: 'long',
    risk_amount: 50,
    quantity: 1,
    entry_price: 100,
    opened_at: '2026-11-04T10:00:00.000Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Daily support test confirmed' } },
      { kind: 'state', payload: { emotional_state: 'calm' } }
    ]
  };

  const result = evaluateTrade(trade, DEMO_STRATEGY);
  assert.equal(result.decision_quality_score, 100);
  assert.equal(result.coverage_pct, 100);
  for (const dim of result.dimensions) {
    assert.equal(dim.status, 'followed');
    for (const rule of dim.rules) {
      assert.equal(rule.status, 'followed');
    }
  }
});

test('Trade Review: broken rules accurately penalize decision quality score', () => {
  const trade = {
    symbol: 'BTC/USDT',
    direction: 'long',
    risk_amount: 150, // breaks $100 max risk
    quantity: 50,
    entry_price: 1000, // notional $50,000 breaks $10,000 max position sizing
    opened_at: '2026-11-04T10:00:00.000Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Impulsive entry' } },
      { kind: 'state', payload: { emotional_state: 'fomo' } } // breaks calm/focused
    ]
  };

  const result = evaluateTrade(trade, DEMO_STRATEGY);
  assert.ok(result.decision_quality_score < 50);
  const brokenDimensions = result.dimensions.filter((d) => d.status === 'broken');
  assert.ok(brokenDimensions.length >= 3);
});

test('Trade Review: missing strategy rules or trade evidence produce CANNOT_ASSESS without fabricated pass or fail', () => {
  // Strategy with no risk or sizing rules defined
  const emptyStrategy = {
    name: 'Sparse Strategy',
    draft_rules: [],
    draft_trading_schedule: null
  };

  const trade = {
    symbol: 'ETH/USDT',
    risk_amount: 50,
    quantity: 1,
    entry_price: 100
  };

  const result = evaluateTrade(trade, emptyStrategy);
  // Risk and sizing must be cannot_assess because the strategy defines no limits
  const riskDim = result.dimensions.find((d) => d.dimension === 'risk');
  const sizingDim = result.dimensions.find((d) => d.dimension === 'sizing');
  assert.equal(riskDim.status, 'cannot_assess');
  assert.equal(sizingDim.status, 'cannot_assess');
  assert.ok(riskDim.rules[0].reason.includes('No risk limit is configured in the confirmed strategy.'));
  assert.ok(sizingDim.rules[0].reason.includes('No position sizing limit is configured in the confirmed strategy.'));
  assert.equal(result.decision_quality_score, null);
  assert.equal(result.coverage_pct, 0);
});

test('Trade Review: Lucky Breach — profitable trade with broken rules is evaluated as undisciplined', async () => {
  // Profitable trade (realized P&L +$500), but exceeded risk and traded in fomo
  const luckyTrade = {
    symbol: 'SOL/USDT',
    direction: 'long',
    risk_amount: 250, // Exceeded risk limit
    realized_pnl: 500, // Profitable outcome
    evidence: [
      { kind: 'state', payload: { emotional_state: 'fomo' } }
    ]
  };

  const deterministic = evaluateTrade(luckyTrade, DEMO_STRATEGY);
  assert.ok(deterministic.decision_quality_score < 100);

  // Mock OpenRouter AI generating Lucky Breach explanation
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Trade made a profit of $500, but violated risk rules and emotional control.',
            most_important_mistake: 'Exceeded maximum allowable risk limit by $150',
            coaching_recommendation: 'Do not let profitable outcomes reinforce reckless risk sizing.',
            profitability_vs_discipline: 'This is a lucky breach: profit was achieved despite poor discipline, which creates dangerous overconfidence.',
            actions: ['Cap risk at $100 strictly on next execution']
          })
        }
      }]
    })
  });

  const provider = createOpenRouterProvider({ openRouterApiKey: 'test-key' }, { fetchFn: mockFetch });
  const ai = await createAiAdapter(provider).explain({ trade: luckyTrade, review: deterministic });

  assert.equal(ai.status, 'available');
  assert.equal(ai.most_important_mistake, 'Exceeded maximum allowable risk limit by $150');
  assert.ok(ai.profitability_vs_discipline.toLowerCase().includes('lucky breach'));
  assert.equal(deterministic.decision_quality_score < 100, true);
});

test('Trade Review: Disciplined Loss — losing trade with followed rules receives full discipline score', async () => {
  // Losing trade (-$80 loss), but followed all risk, sizing, and plan rules
  const disciplinedLossTrade = {
    symbol: 'BTC/USDT',
    direction: 'long',
    risk_amount: 80, // Within $100 limit
    quantity: 1,
    entry_price: 100,
    realized_pnl: -80, // Loss
    opened_at: '2026-11-04T10:00:00.000Z',
    evidence: [
      { kind: 'note', payload: { setup_note: 'Tested support, hit stop loss cleanly' } },
      { kind: 'state', payload: { emotional_state: 'calm' } }
    ]
  };

  const deterministic = evaluateTrade(disciplinedLossTrade, DEMO_STRATEGY);
  assert.equal(deterministic.decision_quality_score, 100);

  // Mock OpenRouter AI praising disciplined loss
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Trade resulted in an $80 loss, but execution was disciplined across all rules.',
            most_important_mistake: null,
            coaching_recommendation: 'Maintain this exact execution consistency across your next 20 trades.',
            profitability_vs_discipline: 'This was a disciplined loss: losing money while following your confirmed rules is expected and successful trading.',
            actions: ['Continue recording setup notes and respecting stop losses']
          })
        }
      }]
    })
  });

  const provider = createOpenRouterProvider({ openRouterApiKey: 'test-key' }, { fetchFn: mockFetch });
  const ai = await createAiAdapter(provider).explain({ trade: disciplinedLossTrade, review: deterministic });

  assert.equal(ai.status, 'available');
  assert.equal(ai.most_important_mistake, null);
  assert.ok(ai.profitability_vs_discipline.toLowerCase().includes('disciplined loss'));
  assert.equal(deterministic.decision_quality_score, 100);
});

test('Trade Review: OpenRouter failure or malformed output keeps deterministic score intact', async () => {
  const trade = {
    symbol: 'BTC/USDT',
    risk_amount: 50,
    quantity: 1,
    entry_price: 100,
    opened_at: '2026-11-04T10:00:00.000Z',
    evidence: [{ kind: 'note', payload: { setup_note: 'A+' } }, { kind: 'state', payload: { emotional_state: 'calm' } }]
  };
  const deterministic = evaluateTrade(trade, DEMO_STRATEGY);

  // AI returns invalid garbage
  const badFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'not valid json at all' } }] })
  });

  const provider = createOpenRouterProvider({ openRouterApiKey: 'key' }, { fetchFn: badFetch });
  const ai = await createAiAdapter(provider).explain({ trade, review: deterministic });

  assert.equal(ai.status, 'unavailable');
  assert.equal(deterministic.decision_quality_score, 100);
});

test('Trade Review API: re_evaluate=true bypasses cached review and recalculates', async () => {
  const store = new MockStore();
  const app = await createApp({
    store,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    const demoRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Test Review Trader' }
    });
    const { token } = JSON.parse(demoRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    const tradesRes = await app.inject({
      method: 'GET',
      url: '/v1/trades',
      headers: authHeaders
    });
    const { trades } = JSON.parse(tradesRes.payload);
    assert.ok(trades.length > 0);
    const tradeId = trades[0].id;

    // The demo session pre-seeds reviews for sample trades, so a normal review call returns cached: true
    const revCachedRes = await app.inject({
      method: 'POST',
      url: `/v1/trades/${tradeId}/review`,
      headers: authHeaders
    });
    const revCached = JSON.parse(revCachedRes.payload);
    assert.equal(revCached.cached, true);

    // GET /v1/trades/:id/review retrieves cached review
    const getRevRes = await app.inject({
      method: 'GET',
      url: `/v1/trades/${tradeId}/review`,
      headers: authHeaders
    });
    assert.equal(getRevRes.statusCode, 200);
    const getRev = JSON.parse(getRevRes.payload);
    assert.ok(getRev.review);

    // Review call with re_evaluate=true bypasses cache and recalculates -> cached: false
    const revReEvalRes = await app.inject({
      method: 'POST',
      url: `/v1/trades/${tradeId}/review?re_evaluate=true`,
      headers: authHeaders
    });
    const revReEval = JSON.parse(revReEvalRes.payload);
    assert.equal(revReEval.cached, false);
    assert.ok(revReEval.review.result.evaluated_at);
  } finally {
    await app.close();
  }
});
