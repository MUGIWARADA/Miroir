import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { createOpenRouterProvider, createAiAdapter } from '../src/ai-adapter.js';

test('Full Journey: 17-step trader end-to-end integration flow', async () => {
  const store = new MockStore();

  // Mock OpenRouter to provide structured responses for AI turns
  const mockFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const systemPrompt = body.messages.find((m) => m.role === 'system')?.content || '';
    const userPrompt = body.messages.find((m) => m.role === 'user')?.content || '';

    // If strategy companion turn
    if (systemPrompt.includes('Miroir AI Strategy Companion')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                assistant_message: 'Great, I noted your entry condition. What is your planned stop-loss method?',
                question_focus: 'stop_loss_method',
                strategy_extraction: {
                  entry_conditions: ['Breakout above previous 4h high with volume spike']
                },
                suggestions: ['Fixed distance', 'Swing low/high', 'ATR trailing stop']
              })
            }
          }]
        })
      };
    }

    // If trade review explanation turn
    if (systemPrompt.includes('expert trading discipline and strategy execution companion')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: 'Disciplined execution adhering to confirmed risk and position sizing limits.',
                most_important_mistake: null,
                coaching_recommendation: 'Maintain position sizing discipline on your next 5 trades.',
                profitability_vs_discipline: 'This was a disciplined loss: following your rules during adverse price action is successful trading.',
                actions: ['Keep recording emotional state and setup notes']
              })
            }
          }]
        })
      };
    }

    // Default JSON
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Analysis complete',
              actions: []
            })
          }
        }]
      })
    };
  };

  const provider = createOpenRouterProvider({ openRouterApiKey: 'e2e-test-key' }, { fetchFn: mockFetch });
  const aiAdapter = createAiAdapter(provider);

  const app = await createApp({
    store,
    aiAdapter,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: Trader authenticates (Demo session)
    // -------------------------------------------------------------
    const authRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'E2E Trader' }
    });
    assert.equal(authRes.statusCode, 201);
    const { token, identity } = JSON.parse(authRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    // Verify session
    const meRes = await app.inject({ method: 'GET', url: '/v1/me', headers: authHeaders });
    assert.equal(meRes.statusCode, 200);
    assert.equal(JSON.parse(meRes.payload).identity.id, identity.id);

    // -------------------------------------------------------------
    // STEP 2 & 4: Trader creates a strategy draft manually or through conversation
    // -------------------------------------------------------------
    const createStratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers: authHeaders,
      payload: {
        name: 'Momentum Breakout Strategy',
        status: 'draft',
        draft_rules: [
          {
            id: 'r-risk',
            dimension: 'risk',
            label: 'Risk at most $100 per trade',
            check: { type: 'max_risk_amount', amount: 100 }
          },
          {
            id: 'r-size',
            dimension: 'sizing',
            label: 'Position size at most $10,000 notional',
            check: { type: 'max_notional', amount: 10000 }
          }
        ]
      }
    });
    assert.equal(createStratRes.statusCode, 201);
    const strategy = JSON.parse(createStratRes.payload).strategy;
    assert.equal(strategy.status, 'draft');

    // -------------------------------------------------------------
    // STEP 3: AI Companion turn (conversational refinement & clarifying questions)
    // -------------------------------------------------------------
    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders,
      payload: { title: 'Strategy Definition', strategy_id: strategy.id, context_type: 'strategy_refinement' }
    });
    const convoId = JSON.parse(convoRes.payload).conversation.id;

    const turnRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers: authHeaders,
      payload: {
        content: 'I only enter when price breaks out above the 4h resistance with a volume spike.',
        strategy_id: strategy.id
      }
    });
    assert.equal(turnRes.statusCode, 200);
    const turnData = JSON.parse(turnRes.payload);
    assert.ok(turnData.assistant_message.content);
    assert.ok(turnData.question_focus);

    // -------------------------------------------------------------
    // STEP 5: Trader reviews and edits the strategy draft
    // -------------------------------------------------------------
    const editRes = await app.inject({
      method: 'PUT',
      url: `/v1/strategies/${strategy.id}`,
      headers: authHeaders,
      payload: {
        markets: ['BTC/USDT'],
        timeframes: ['1h', '4h'],
        entry_conditions: ['Breakout above previous 4h high with volume spike'],
        stop_loss_method: { type: 'swing_low', description: 'Under previous swing low' },
        exit_plan: { type: 'trailing_or_target', description: 'Take 50% at 2R, trail stop behind 1h swing low' },
        draft_trading_schedule: {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          start_time: '08:00',
          end_time: '16:00',
          timezone: 'UTC'
        }
      }
    });
    assert.equal(editRes.statusCode, 200);

    // -------------------------------------------------------------
    // STEP 6: Strategy validation engine
    // -------------------------------------------------------------
    const valRes = await app.inject({
      method: 'GET',
      url: `/v1/strategies/${strategy.id}/validation`,
      headers: authHeaders
    });
    assert.equal(valRes.statusCode, 200);
    const valData = JSON.parse(valRes.payload).validation;
    assert.equal(valData.is_valid_for_confirmation, true);

    // -------------------------------------------------------------
    // STEP 7 & 8: Explicit trader confirmation produces an immutable version
    // -------------------------------------------------------------
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers: authHeaders,
      payload: { change_summary: 'Initial verified baseline v1' }
    });
    assert.equal(confirmRes.statusCode, 200);
    const { strategy: confirmedStrat, version: immutableVersion } = JSON.parse(confirmRes.payload);
    assert.equal(confirmedStrat.status, 'confirmed');
    assert.ok(immutableVersion.id);
    assert.equal(immutableVersion.version_number, 1);
    assert.equal(immutableVersion.snapshot.name, 'Momentum Breakout Strategy');

    // -------------------------------------------------------------
    // STEP 9: Trader records trade explicitly selecting strategy & version
    // -------------------------------------------------------------
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/v1/trades',
      headers: authHeaders,
      payload: {
        symbol: 'BTC/USDT',
        direction: 'long',
        quantity: 1,
        entry_price: 100,
        risk_amount: 80, // Within $100
        strategy_id: confirmedStrat.id,
        strategy_version_id: immutableVersion.id,
        opened_at: '2026-11-05T10:00:00Z',
        realized_pnl: -80, // Loss
        evidence: [
          { kind: 'note', payload: { setup_note: 'Breakout above 4h resistance with volume' } },
          { kind: 'state', payload: { emotional_state: 'calm' } }
        ]
      }
    });
    assert.equal(tradeRes.statusCode, 201);
    const trade = JSON.parse(tradeRes.payload).trade;
    assert.equal(trade.strategy_id, confirmedStrat.id);
    assert.equal(trade.strategy_version_id, immutableVersion.id);

    // -------------------------------------------------------------
    // STEP 10, 11, 12, 13: Deterministic evaluation + OpenRouter explanation + review persistence
    // -------------------------------------------------------------
    const reviewRes = await app.inject({
      method: 'POST',
      url: `/v1/trades/${trade.id}/review`,
      headers: authHeaders
    });
    assert.equal(reviewRes.statusCode, 200);
    const review = JSON.parse(reviewRes.payload).review;

    // Deterministic results check
    assert.equal(review.result.decision_quality_score, 100);
    assert.equal(review.result.dimensions.find((d) => d.dimension === 'risk').status, 'followed');
    assert.equal(review.result.strategy_version_id, immutableVersion.id);

    // AI explanation check
    assert.ok(review.result.ai_explanation);
    assert.equal(review.result.ai_explanation.status, 'available');
    assert.ok(review.result.ai_explanation.profitability_vs_discipline.includes('disciplined loss'));

    // -------------------------------------------------------------
    // STEP 14: Historical review remains intact on subsequent fetch
    // -------------------------------------------------------------
    const cachedReviewRes = await app.inject({
      method: 'GET',
      url: `/v1/trades/${trade.id}/review`,
      headers: authHeaders
    });
    assert.equal(cachedReviewRes.statusCode, 200);
    const cached = JSON.parse(cachedReviewRes.payload).review;
    assert.equal(cached.result.decision_quality_score, 100);
    assert.equal(cached.result.strategy_version_id, immutableVersion.id);

    // -------------------------------------------------------------
    // STEP 15: Miroir identifies personal patterns across history
    // -------------------------------------------------------------
    const patternRes = await app.inject({
      method: 'GET',
      url: `/v1/intelligence/patterns?strategy_id=${confirmedStrat.id}`,
      headers: authHeaders
    });
    assert.equal(patternRes.statusCode, 200);
    const patterns = JSON.parse(patternRes.payload).patterns;
    assert.equal(patterns.analysis_meta.total_trades_analyzed, 1);
    assert.equal(patterns.risk_management.violations, 0);

    // -------------------------------------------------------------
    // STEP 16 & 17: Progress Companion responds with evidence-backed answers
    // -------------------------------------------------------------
    const progressConvoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders,
      payload: { title: 'Personal Progress', context_type: 'weekly_coaching' }
    });
    const progressConvoId = JSON.parse(progressConvoRes.payload).conversation.id;

    const progressTurnRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${progressConvoId}/progress-turn`,
      headers: authHeaders,
      payload: { question: 'Am I following my risk rules?' }
    });
    assert.equal(progressTurnRes.statusCode, 200);
    const progressData = JSON.parse(progressTurnRes.payload);
    assert.ok(progressData.answer);
    assert.ok(Array.isArray(progressData.observed_facts));
    assert.ok(progressData.confidence_level);
  } finally {
    await app.close();
  }
});
