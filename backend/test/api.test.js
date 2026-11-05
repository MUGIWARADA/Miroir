import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { createAiAdapter, createOpenRouterProvider } from '../src/ai-adapter.js';

const config = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' };

async function withApp(fn) {
  const app = await createApp({ store: new MockStore(), config });
  try { await fn(app); } finally { await app.close(); }
}

test('health reports the configured data mode without auth', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', data_mode: 'mock' });
  });
});

test('demo session exposes a token; protected routes require it', async () => {
  await withApp(async (app) => {
    const denied = await app.inject({ method: 'GET', url: '/v1/strategies' });
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.json().error.code, 'UNAUTHENTICATED');

    const sessionResponse = await app.inject({ method: 'POST', url: '/v1/demo/session', payload: { display_name: 'Test Trader' } });
    assert.equal(sessionResponse.statusCode, 201);
    const session = sessionResponse.json();
    assert.equal(session.identity.display_name, 'Test Trader');
    assert.equal(session.identity.mode, 'demo');
    assert.ok(session.demo_data.strategy_version_id);
    const auth = { authorization: `Bearer ${session.token}` };

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: auth });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().identity.id, session.identity.id);
    const proxyHeaderMe = await app.inject({ method: 'GET', url: '/v1/me', headers: { 'x-miroir-session': session.token } });
    assert.equal(proxyHeaderMe.statusCode, 200);
    assert.equal(proxyHeaderMe.json().identity.id, session.identity.id);
    const strategies = await app.inject({ method: 'GET', url: '/v1/strategies', headers: auth });
    assert.equal(strategies.statusCode, 200);
    assert.equal(strategies.json().strategies.length, 1);
  });
});

test('trade history, bodyless review, stats and progress use stable response shapes', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    const list = await app.inject({ method: 'GET', url: '/v1/trades', headers });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().trades.length, 3);
    assert.ok(list.json().trades[0].id);

    const tradeId = list.json().trades[0].id;
    const review = await app.inject({ method: 'POST', url: `/v1/trades/${tradeId}/review`, headers });
    assert.equal(review.statusCode, 200);
    assert.equal(typeof review.json().review.result.coverage_pct, 'number');
    assert.ok(Array.isArray(review.json().review.result.dimensions));
    const cached = await app.inject({ method: 'POST', url: `/v1/trades/${tradeId}/review`, headers });
    assert.equal(cached.json().cached, true);

    const stats = await app.inject({ method: 'GET', url: '/v1/stats?currency=USD', headers });
    assert.equal(stats.statusCode, 200);
    assert.equal(stats.json().stats.sample_size, 3);
    assert.equal(stats.json().stats.net_realized_pnl, 945);
    const progress = await app.inject({ method: 'GET', url: '/v1/progress', headers });
    assert.equal(progress.statusCode, 200);
    assert.equal(progress.json().progress.versions[0].assessed_trades, 3);
  });
});

test('manual trade creation validates input and then returns a stored trade', async () => {
  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    const strats = (await app.inject({ method: 'GET', url: '/v1/strategies', headers })).json().strategies;
    const stratId = strats[0].id;

    const bad = await app.inject({ method: 'POST', url: '/v1/trades', headers, payload: { direction: 'long' } });
    assert.equal(bad.statusCode, 400);

    const noStrat = await app.inject({ method: 'POST', url: '/v1/trades', headers, payload: { symbol: 'xbt/usdt', direction: 'long' } });
    assert.equal(noStrat.statusCode, 400);
    assert.equal(noStrat.json().error.code, 'STRATEGY_REQUIRED');

    const good = await app.inject({
      method: 'POST',
      url: '/v1/trades',
      headers,
      payload: {
        symbol: 'xbt/usdt',
        direction: 'long',
        quantity: 0.1,
        entry_price: 50000,
        strategy_id: stratId
      }
    });
    assert.equal(good.statusCode, 201);
    assert.equal(good.json().trade.symbol, 'XBT/USDT');
    assert.equal(good.json().trade.strategy_id, stratId);
  });
});

test('self-managed registration requires persistent PostgreSQL', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'trader@example.com', password: 'very-secure-password' } });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'AUTH_REQUIRES_POSTGRES');
  });
});

test('POST /v1/trades/:id/review incorporates OpenRouter AI explanation when configured', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Disciplined trade execution matching confirmed strategy rules.',
            actions: ['Maintain current position sizing']
          })
        }
      }]
    })
  });
  const customConfig = { ...config, openRouterApiKey: 'test-key', openRouterModel: 'google/gemini-2.0-flash-001' };
  const customAiAdapter = createAiAdapter(createOpenRouterProvider(customConfig, { fetchFn: mockFetch }));
  const app = await createApp({ store: new MockStore(), config: customConfig, aiAdapter: customAiAdapter });
  try {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    const strats = (await app.inject({ method: 'GET', url: '/v1/strategies', headers })).json().strategies;
    const stratId = strats[0].id;

    // Create a new unreviewed trade
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/v1/trades',
      headers,
      payload: {
        symbol: 'SOL/USDT',
        direction: 'long',
        quantity: 5,
        entry_price: 150,
        risk_amount: 50,
        strategy_id: stratId
      }
    });
    const tradeId = tradeRes.json().trade.id;

    const reviewRes = await app.inject({ method: 'POST', url: `/v1/trades/${tradeId}/review`, headers });
    assert.equal(reviewRes.statusCode, 200);
    assert.equal(reviewRes.json().cached, false);
    const result = reviewRes.json().review.result;
    assert.equal(result.ai_explanation.status, 'available');
    assert.equal(result.ai_explanation.summary, 'Disciplined trade execution matching confirmed strategy rules.');
    assert.deepEqual(result.ai_explanation.actions, ['Maintain current position sizing']);
  } finally {
    await app.close();
  }
});
