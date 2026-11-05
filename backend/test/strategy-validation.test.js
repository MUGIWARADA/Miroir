import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { validateStrategy, VALIDATION_STATUS } from '../src/strategy-validator.js';

const config = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' };

async function withApp(fn) {
  const store = new MockStore();
  const app = await createApp({ store, config });
  try {
    await fn(app, store);
  } finally {
    await app.close();
  }
}

test('strategy validation: complete strategy confirmation succeeds and snapshots metadata', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // 1. Create a complete strategy draft
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'ETH Momentum Pro',
        description: 'Disciplined 1h trend continuation',
        status: 'draft',
        markets: ['ETH/USDT'],
        timeframes: ['1h', '15m'],
        entry_conditions: ['Breakout above previous 4h high with volume confirmation'],
        stop_loss_method: { type: 'swing_low', description: '5 ticks below 1h swing low' },
        exit_plan: { type: 'take_profit', description: 'Take 50% at 2R, trail remaining behind 15m structure' },
        risk_rules: [{ id: 'risk-100', dimension: 'risk', label: 'Max risk $100', check: { type: 'max_risk_amount', amount: 100 } }],
        position_sizing_rules: [{ id: 'size-5k', dimension: 'sizing', label: 'Max notional $5000', check: { type: 'max_notional', amount: 5000 } }],
        draft_trading_schedule: {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          start_time: '08:00',
          end_time: '17:00',
          timezone: 'UTC'
        },
        other_restrictions: ['No new entries within 15 minutes of CPI release'],
        preferences: ['Prefer London and New York overlap session']
      }
    });

    const strategy = stratRes.json().strategy;
    assert.equal(strategy.status, 'draft');

    // 2. Validate endpoint
    const valRes = await app.inject({
      method: 'GET',
      url: `/v1/strategies/${strategy.id}/validation`,
      headers
    });
    assert.equal(valRes.statusCode, 200);
    assert.equal(valRes.json().validation.status, VALIDATION_STATUS.COMPLETE);
    assert.equal(valRes.json().validation.is_valid_for_confirmation, true);

    // 3. Confirm strategy
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers,
      payload: { change_summary: 'Initial complete strategy baseline' }
    });

    assert.equal(confirmRes.statusCode, 200);
    const confirmed = confirmRes.json();
    assert.equal(confirmed.strategy.status, 'confirmed');
    assert.equal(confirmed.strategy.version_number, 1);
    assert.equal(confirmed.version.version_number, 1);
    assert.equal(confirmed.version.change_summary, 'Initial complete strategy baseline');
    assert.ok(confirmed.version.snapshot);
    assert.deepEqual(confirmed.version.snapshot.markets, ['ETH/USDT']);
  });
});

test('strategy validation: incomplete strategy confirmation is rejected with detailed missing fields', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // Strategy missing entry conditions, stop-loss, and exit plan
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'Incomplete Draft',
        status: 'draft',
        markets: ['BTC/USDT'],
        timeframes: ['1h']
      }
    });
    const strategy = stratRes.json().strategy;

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers,
      payload: { change_summary: 'Should fail' }
    });

    assert.equal(confirmRes.statusCode, 400);
    const err = confirmRes.json().error;
    assert.equal(err.code, 'STRATEGY_INCOMPLETE');
    assert.ok(err.details.validation.missing_fields.includes('entry_conditions'));
    assert.ok(err.details.validation.missing_fields.includes('stop_loss_method'));
    assert.ok(err.details.validation.missing_fields.includes('exit_plan'));
  });
});

test('strategy validation: contradictory rules are strictly rejected', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // Contradiction: Risk ($1000) exceeds total position size ($200)
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'Contradictory Sizing Strategy',
        status: 'draft',
        markets: ['SOL/USDT'],
        timeframes: ['15m'],
        entry_conditions: ['Breakout of 15m consolidation'],
        stop_loss_method: { type: 'swing_low', description: 'Under swing low' },
        exit_plan: { type: 'take_profit', description: 'At 2R' },
        risk_rules: [{ id: 'risk-1000', dimension: 'risk', label: 'Max risk $1000', check: { type: 'max_risk_amount', amount: 1000 } }],
        position_sizing_rules: [{ id: 'size-200', dimension: 'sizing', label: 'Max position $200', check: { type: 'max_notional', amount: 200 } }]
      }
    });
    const strategy = stratRes.json().strategy;

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers
    });

    assert.equal(confirmRes.statusCode, 400);
    const err = confirmRes.json().error;
    assert.equal(err.code, 'STRATEGY_CONTRADICTORY');
    assert.ok(err.details.validation.contradictory_fields.includes('risk_rules'));
    assert.ok(err.details.validation.contradictory_fields.includes('position_sizing_rules'));
  });
});

test('strategy validation: ambiguous rules require explicit trader acknowledgment', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // Strategy with vague/ambiguous wording: "when market feels right"
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'Subjective Strategy',
        status: 'draft',
        markets: ['BTC/USDT'],
        timeframes: ['1h'],
        entry_conditions: ['Buy when market feels right'],
        stop_loss_method: { type: 'swing_low', description: 'Placed below previous 1h swing low' },
        exit_plan: { type: 'take_profit', description: 'Take 50% profit at 2R' },
        risk_rules: [{ id: 'risk-50', dimension: 'risk', label: 'Max risk 50 USD', check: { type: 'max_risk_amount', amount: 50 } }]
      }
    });
    const strategy = stratRes.json().strategy;

    // First attempt without acknowledgment -> rejected
    const unacknowledgedRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers
    });
    assert.equal(unacknowledgedRes.statusCode, 400);
    assert.equal(unacknowledgedRes.json().error.code, 'STRATEGY_AMBIGUOUS');

    // Second attempt with explicit acknowledgment -> accepted
    const acknowledgedRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strategy.id}/confirm`,
      headers,
      payload: {
        acknowledge_ambiguity: true,
        change_summary: 'Acknowledged subjective entry rule'
      }
    });
    assert.equal(acknowledgedRes.statusCode, 200);
    assert.equal(acknowledgedRes.json().strategy.status, 'confirmed');
  });
});

test('strategy confirmation: unauthorized trader cannot confirm another trader strategy', async () => {
  await withApp(async (app) => {
    const userA = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headersA = { authorization: `Bearer ${userA.token}` };

    const userB = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headersB = { authorization: `Bearer ${userB.token}` };

    // User A creates draft
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers: headersA,
      payload: { name: 'User A Private Strategy', status: 'draft' }
    });
    const stratId = stratRes.json().strategy.id;

    // User B tries to confirm User A's strategy
    const forbiddenRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${stratId}/confirm`,
      headers: headersB
    });
    assert.equal(forbiddenRes.statusCode, 404);
  });
});

test('strategy confirmation: AI companion turn cannot confirm strategy (only explicit trader action can confirm)', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'AI Discussion Strategy',
        status: 'draft',
        markets: ['ETH/USDT'],
        timeframes: ['1h'],
        entry_conditions: ['Breakout of 1h high'],
        stop_loss_method: { type: 'swing_low', description: 'Below 1h low' },
        exit_plan: { type: 'take_profit', description: 'Exit at 2R' },
        risk_rules: [{ id: 'risk-50', dimension: 'risk', label: 'Max risk 50', check: { type: 'max_risk_amount', amount: 50 } }]
      }
    });
    const strat = stratRes.json().strategy;

    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers,
      payload: { title: 'Strategy Chat', strategy_id: strat.id }
    });
    const convoId = convoRes.json().conversation.id;

    // User chats with companion saying "I confirm this strategy"
    const turnRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers,
      payload: { content: 'Please confirm this strategy right now.' }
    });
    assert.equal(turnRes.statusCode, 200);

    // Strategy must STILL be draft! Companion cannot confirm!
    const stratCheck = await app.inject({ method: 'GET', url: `/v1/strategies/${strat.id}`, headers });
    assert.equal(stratCheck.json().strategy.status, 'draft');
    assert.equal(stratCheck.json().strategy.current_version_id, null);
  });
});

test('historical integrity: confirmed version is immutable; edits create draft; past trades reference original version', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // 1. Create and confirm Version 1 (Risk $50)
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: {
        name: 'Versioned Strategy',
        status: 'confirmed',
        markets: ['BTC/USDT'],
        timeframes: ['1h'],
        entry_conditions: ['Breakout 1h'],
        stop_loss_method: { type: 'swing_low', description: 'Under 1h low' },
        exit_plan: { type: 'take_profit', description: 'Target 2R' },
        draft_rules: [{ id: 'risk-50', dimension: 'risk', label: 'Max risk 50', check: { type: 'max_risk_amount', amount: 50 } }]
      }
    });
    const strat = stratRes.json().strategy;
    const v1Id = strat.current_version_id;

    // 2. Record trade under Version 1 (Risk $60 -> breaks rule under v1)
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/v1/trades',
      headers,
      payload: {
        symbol: 'BTC/USDT',
        direction: 'long',
        quantity: 0.1,
        entry_price: 60000,
        risk_amount: 60,
        strategy_id: strat.id,
        strategy_version_id: v1Id,
        opened_at: '2026-11-04T10:00:00.000Z'
      }
    });
    const trade1 = tradeRes.json().trade;

    // Review trade 1 under version 1 -> broken
    const r1 = await app.inject({ method: 'POST', url: `/v1/trades/${trade1.id}/review`, headers });
    assert.equal(r1.json().review.result.dimensions.find((d) => d.dimension === 'risk').status, 'broken');

    // 3. Edit strategy to raise risk limit to $100 -> moves strategy to 'draft'
    const editRes = await app.inject({
      method: 'PUT',
      url: `/v1/strategies/${strat.id}`,
      headers,
      payload: {
        draft_rules: [{ id: 'risk-100', dimension: 'risk', label: 'Max risk 100', check: { type: 'max_risk_amount', amount: 100 } }]
      }
    });
    assert.equal(editRes.json().strategy.status, 'draft');

    // 4. Confirm new version -> Version 2
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/v1/strategies/${strat.id}/confirm`,
      headers,
      payload: { change_summary: 'Raised risk to $100' }
    });
    const v2 = confirmRes.json().version;
    assert.equal(v2.version_number, 2);

    // 5. Inspect Version 1 history -> Version 1 snapshot is completely unchanged!
    const v1Inspect = await app.inject({
      method: 'GET',
      url: `/v1/strategies/${strat.id}/versions/${v1Id}`,
      headers
    });
    assert.equal(v1Inspect.json().version.version_number, 1);
    assert.equal(v1Inspect.json().version.rules[0].check.amount, 50); // Unchanged!

    // 6. Review trade 1 again -> Historical trade still references Version 1 and remains broken!
    const r1Rechecked = await app.inject({ method: 'POST', url: `/v1/trades/${trade1.id}/review`, headers });
    assert.equal(r1Rechecked.json().review.result.dimensions.find((d) => d.dimension === 'risk').status, 'broken');
  });
});
