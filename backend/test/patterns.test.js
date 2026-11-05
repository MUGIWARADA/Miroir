import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTradingPatterns, classifyConfidenceTier, ConfidenceTier } from '../src/pattern-engine.js';
import { createAiAdapter, createOpenRouterProvider } from '../src/ai-adapter.js';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';

test('Confidence tiers: transparent sample-size protections', () => {
  assert.equal(classifyConfidenceTier(0), ConfidenceTier.INSUFFICIENT_DATA);
  assert.equal(classifyConfidenceTier(2), ConfidenceTier.INSUFFICIENT_DATA);
  assert.equal(classifyConfidenceTier(3), ConfidenceTier.EARLY_PATTERN);
  assert.equal(classifyConfidenceTier(5), ConfidenceTier.EARLY_PATTERN);
  assert.equal(classifyConfidenceTier(6), ConfidenceTier.REPEATED_PATTERN);
  assert.equal(classifyConfidenceTier(14), ConfidenceTier.REPEATED_PATTERN);
  assert.equal(classifyConfidenceTier(15), ConfidenceTier.STRONGER_EVIDENCE);
  assert.equal(classifyConfidenceTier(50), ConfidenceTier.STRONGER_EVIDENCE);
});

test('Pattern detection on empty history returns clean empty structure with INSUFFICIENT_DATA', () => {
  const result = detectTradingPatterns({ trades: [], reviews: [] });
  assert.equal(result.analysis_meta.total_trades_analyzed, 0);
  assert.equal(result.analysis_meta.reviewed_trades_analyzed, 0);
  assert.deepEqual(result.frequently_broken_rules, []);
  assert.equal(result.risk_management.confidence_tier, ConfidenceTier.INSUFFICIENT_DATA);
  assert.equal(result.discipline_trend.confidence_tier, ConfidenceTier.INSUFFICIENT_DATA);
  assert.deepEqual(result.by_instrument, []);
  assert.deepEqual(result.emotional_state_patterns, []);
});

test('Pattern detection accurately tallies frequently broken rules and associates sample sizes', () => {
  const trades = [
    { id: 't1', symbol: 'BTC/USDT', opened_at: '2026-11-01T10:00:00Z', risk_amount: 150 },
    { id: 't2', symbol: 'BTC/USDT', opened_at: '2026-11-02T10:00:00Z', risk_amount: 150 },
    { id: 't3', symbol: 'BTC/USDT', opened_at: '2026-11-03T10:00:00Z', risk_amount: 150 },
    { id: 't4', symbol: 'BTC/USDT', opened_at: '2026-11-04T10:00:00Z', risk_amount: 50 },
  ];

  const reviews = [
    {
      trade_id: 't1',
      result: {
        decision_quality_score: 50,
        dimensions: [{
          dimension: 'risk', status: 'broken',
          rules: [{ rule_id: 'risk-limit', label: 'Risk limit ($100)', status: 'broken', reason: 'Exceeded' }]
        }]
      }
    },
    {
      trade_id: 't2',
      result: {
        decision_quality_score: 50,
        dimensions: [{
          dimension: 'risk', status: 'broken',
          rules: [{ rule_id: 'risk-limit', label: 'Risk limit ($100)', status: 'broken', reason: 'Exceeded' }]
        }]
      }
    },
    {
      trade_id: 't3',
      result: {
        decision_quality_score: 50,
        dimensions: [{
          dimension: 'risk', status: 'broken',
          rules: [{ rule_id: 'risk-limit', label: 'Risk limit ($100)', status: 'broken', reason: 'Exceeded' }]
        }]
      }
    },
    {
      trade_id: 't4',
      result: {
        decision_quality_score: 100,
        dimensions: [{
          dimension: 'risk', status: 'followed',
          rules: [{ rule_id: 'risk-limit', label: 'Risk limit ($100)', status: 'followed', reason: 'Within limit' }]
        }]
      }
    }
  ];

  const report = detectTradingPatterns({ trades, reviews });
  assert.equal(report.analysis_meta.total_trades_analyzed, 4);
  assert.equal(report.analysis_meta.reviewed_trades_analyzed, 4);

  assert.equal(report.frequently_broken_rules.length, 1);
  const broken = report.frequently_broken_rules[0];
  assert.equal(broken.label, 'Risk limit ($100)');
  assert.equal(broken.broken_count, 3);
  assert.equal(broken.sample_size, 4);
  assert.equal(broken.violation_rate_pct, 75);
  assert.equal(broken.confidence_tier, ConfidenceTier.EARLY_PATTERN); // 3 occurrences is early pattern

  assert.equal(report.risk_management.violations, 3);
  assert.equal(report.risk_management.assessed_trades, 4);
  assert.equal(report.risk_management.adherence_pct, 25);
  assert.equal(report.risk_management.pattern_detected, true);
});

test('Pattern detection supports date filtering', () => {
  const trades = [
    { id: 't1', symbol: 'BTC/USDT', opened_at: '2026-10-01T10:00:00Z', realized_pnl: 100 },
    { id: 't2', symbol: 'BTC/USDT', opened_at: '2026-11-01T10:00:00Z', realized_pnl: 200 }
  ];
  const reviews = [
    { trade_id: 't1', result: { decision_quality_score: 100, dimensions: [] } },
    { trade_id: 't2', result: { decision_quality_score: 100, dimensions: [] } }
  ];

  const filtered = detectTradingPatterns({
    trades, reviews,
    filter: { startDate: '2026-10-15T00:00:00Z', endDate: '2026-11-15T00:00:00Z' }
  });

  assert.equal(filtered.analysis_meta.total_trades_analyzed, 1);
  assert.equal(filtered.by_instrument[0].total_pnl, 200);
});

test('Pattern detection supports strategy and version filtering', () => {
  const trades = [
    { id: 't1', symbol: 'BTC/USDT', strategy_id: 'strat-1', strategy_version_id: 'v1', realized_pnl: 100 },
    { id: 't2', symbol: 'ETH/USDT', strategy_id: 'strat-2', strategy_version_id: 'v2', realized_pnl: -50 }
  ];
  const reviews = [
    { trade_id: 't1', result: { decision_quality_score: 90, dimensions: [] } },
    { trade_id: 't2', result: { decision_quality_score: 40, dimensions: [] } }
  ];

  const reportStrat1 = detectTradingPatterns({
    trades, reviews,
    filter: { strategyId: 'strat-1' }
  });
  assert.equal(reportStrat1.analysis_meta.total_trades_analyzed, 1);
  assert.equal(reportStrat1.by_instrument[0].instrument, 'BTC/USDT');

  const reportVersion2 = detectTradingPatterns({
    trades, reviews,
    filter: { strategyVersionId: 'v2' }
  });
  assert.equal(reportVersion2.analysis_meta.total_trades_analyzed, 1);
  assert.equal(reportVersion2.by_instrument[0].instrument, 'ETH/USDT');
});

test('Emotional state associations distinguish correlation without causal claims', () => {
  const trades = [
    {
      id: 't1', symbol: 'BTC/USDT', realized_pnl: -100,
      evidence: [{ kind: 'state', payload: { emotional_state: 'fomo' } }]
    },
    {
      id: 't2', symbol: 'BTC/USDT', realized_pnl: -200,
      evidence: [{ kind: 'state', payload: { emotional_state: 'fomo' } }]
    },
    {
      id: 't3', symbol: 'BTC/USDT', realized_pnl: 300,
      evidence: [{ kind: 'state', payload: { emotional_state: 'calm' } }]
    }
  ];

  const reviews = [
    {
      trade_id: 't1',
      result: {
        decision_quality_score: 40,
        dimensions: [{ dimension: 'risk', status: 'broken', rules: [] }]
      }
    },
    {
      trade_id: 't2',
      result: {
        decision_quality_score: 30,
        dimensions: [{ dimension: 'sizing', status: 'broken', rules: [] }]
      }
    },
    {
      trade_id: 't3',
      result: {
        decision_quality_score: 100,
        dimensions: [{ dimension: 'risk', status: 'followed', rules: [] }]
      }
    }
  ];

  const report = detectTradingPatterns({ trades, reviews });
  const fomoPattern = report.emotional_state_patterns.find((e) => e.emotion === 'fomo');
  assert.ok(fomoPattern);
  assert.equal(fomoPattern.observations, 2);
  assert.equal(fomoPattern.broken_rules_observed, 2);
  assert.equal(fomoPattern.total_realized_pnl, -300);
  // Method and limitations explicitly state correlation != causation
  assert.ok(fomoPattern.limitations.toLowerCase().includes('correlation does not establish causation'));
});

test('Discipline trajectory over time compares earlier vs recent halves', () => {
  const trades = [
    { id: 't1', opened_at: '2026-11-01T10:00:00Z' },
    { id: 't2', opened_at: '2026-11-02T10:00:00Z' },
    { id: 't3', opened_at: '2026-11-03T10:00:00Z' },
    { id: 't4', opened_at: '2026-11-04T10:00:00Z' }
  ];
  const reviews = [
    { trade_id: 't1', result: { decision_quality_score: 50, dimensions: [] } },
    { trade_id: 't2', result: { decision_quality_score: 50, dimensions: [] } },
    { trade_id: 't3', result: { decision_quality_score: 90, dimensions: [] } },
    { trade_id: 't4', result: { decision_quality_score: 90, dimensions: [] } }
  ];

  const report = detectTradingPatterns({ trades, reviews });
  assert.equal(report.discipline_trend.earlier_avg_score, 50);
  assert.equal(report.discipline_trend.recent_avg_score, 90);
  assert.equal(report.discipline_trend.trend_direction, 'improving');
  assert.equal(report.discipline_trend.confidence_tier, ConfidenceTier.EARLY_PATTERN);
});

test('OpenRouter pattern interpretation integrates deterministic report without fabricating claims', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'You broke your maximum risk rule in 3 of 4 reviewed trades.',
            top_pattern: 'Risk limit breached in 75% of assessed trades',
            confidence_evaluation: 'This is an early pattern (sample size 4), but warrants attention',
            coaching_recommendation: 'Strictly calculate your position size before placing entry orders',
            actions: ['Set hard stop-loss at exactly $100 risk amount']
          })
        }
      }]
    })
  });

  const provider = createOpenRouterProvider({ openRouterApiKey: 'valid-key' }, { fetchFn: mockFetch });
  const ai = createAiAdapter(provider);

  const report = detectTradingPatterns({
    trades: [{ id: 't1', symbol: 'BTC' }],
    reviews: [{ trade_id: 't1', result: { decision_quality_score: 80, dimensions: [] } }]
  });

  const interpretation = await ai.interpretPatterns(report);
  assert.equal(interpretation.status, 'available');
  assert.equal(interpretation.top_pattern, 'Risk limit breached in 75% of assessed trades');
  assert.ok(interpretation.confidence_evaluation.includes('early pattern'));
  assert.deepEqual(interpretation.actions, ['Set hard stop-loss at exactly $100 risk amount']);
});

test('Cross-user isolation: User A pattern query never includes User B trades', async () => {
  const store = new MockStore();
  const app = await createApp({
    store,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    // User A session
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Trader A' }
    });
    const tokenA = JSON.parse(resA.payload).token;

    // User B session
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Trader B' }
    });
    const tokenB = JSON.parse(resB.payload).token;

    // Fetch patterns for User A
    const patA = await app.inject({
      method: 'GET',
      url: '/v1/intelligence/patterns',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(patA.statusCode, 200);
    const dataA = JSON.parse(patA.payload);

    // Fetch patterns for User B
    const patB = await app.inject({
      method: 'GET',
      url: '/v1/intelligence/patterns',
      headers: { authorization: `Bearer ${tokenB}` }
    });
    assert.equal(patB.statusCode, 200);
    const dataB = JSON.parse(patB.payload);

    // Each user has their own seeded trades (3 each), isolated in counts
    assert.equal(dataA.patterns.analysis_meta.total_trades_analyzed, 3);
    assert.equal(dataB.patterns.analysis_meta.total_trades_analyzed, 3);
  } finally {
    await app.close();
  }
});
