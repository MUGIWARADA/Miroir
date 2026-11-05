import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { RoqquClient } from '../src/roqqu.js';

const testConfig = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' };

test('mock-mode Roqqu reads are clearly marked sample data and remain read-only', async () => {
  const app = await createApp({ store: new MockStore(), config: testConfig });
  try {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    const status = await app.inject({ method: 'GET', url: '/v1/roqqu/status', headers });
    assert.equal(status.json().enabled, true);
    assert.equal(status.json().mode, 'mock');
    assert.equal(status.json().writes_enabled, false);
    const balances = await app.inject({ method: 'GET', url: '/v1/roqqu/balances', headers });
    assert.equal(balances.statusCode, 200);
    assert.equal(balances.json().sample_data, true);
    assert.ok(balances.json().balance.usdt > 0);
    const history = await app.inject({ method: 'GET', url: '/v1/roqqu/history', headers });
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().sample_data, true);
    assert.ok(Array.isArray(history.json().history));
  } finally { await app.close(); }
});

test('demo sessions cannot access per-user Roqqu reads', async () => {
  const config = { ...testConfig, dataMode: 'postgres' };
  const app = await createApp({ store: new MockStore(), config });
  try {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    const status = await app.inject({ method: 'GET', url: '/v1/roqqu/status', headers });
    assert.equal(status.json().enabled, false);
    assert.equal(status.json().configured, false);
    assert.equal(status.json().access_model, 'user_auth_required');
    const balances = await app.inject({ method: 'GET', url: '/v1/roqqu/balances', headers });
    assert.equal(balances.statusCode, 403);
    assert.equal(balances.json().error.code, 'VERIFIED_USER_REQUIRED');
  } finally { await app.close(); }
});

test('Roqqu client pins read paths, uses only staging auth, and sends form fields', async () => {
  const calls = [];
  const client = new RoqquClient({
    stagingApiKey: 'secret-for-test',
    accountEmail: 'demo@example.invalid',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ status: 'success', data: { balance: { usdt: 1 } } }) };
    }
  });
  const data = await client.getBalances();
  assert.equal(data.balance.usdt, 1);
  assert.equal(calls[0].url, 'https://service.roqqu.com/v1/balances');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['x-staging-api-key'], 'secret-for-test');
  assert.equal(calls[0].options.headers['x-api-key'], undefined);
  assert.equal(calls[0].options.body.get('email'), 'demo@example.invalid');
  assert.equal(JSON.stringify(calls[0].options.body).includes('secret-for-test'), false);
});
