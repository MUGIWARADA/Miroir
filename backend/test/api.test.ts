import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { PgliteDb } from '../src/db/pglite.js';
import type {
  ScoringClient,
  ScoringRequest,
  ScoringResponse,
} from '../src/services/scoring-client.js';

class FakeScoring implements ScoringClient {
  calls = 0;
  fail = false;
  lastInput?: ScoringRequest;
  async score(input: ScoringRequest): Promise<ScoringResponse> {
    if (this.fail) throw new Error('Scoring service is offline');
    this.calls += 1;
    this.lastInput = input;
    return {
      request_id: input.request_id,
      scoring_version: input.scoring_version,
      strategy_version_id: input.strategy_version.id,
      trade_id: String(input.trade.id),
      decision_quality_score: 80,
      coverage_pct: 90,
      dimensions: [
        {
          dimension: 'risk',
          status: 'followed',
          score_pct: 100,
          weight: 30,
          assessable_weight: 30,
          earned_weight: 30,
          rules: [],
        },
      ],
      coaching: { mode: 'rule_based', summary: 'Fake coaching', actions: [] },
      warnings: [],
    };
  }
}

const config: AppConfig = {
  host: '127.0.0.1',
  port: 0,
  corsOrigin: true,
  trustProxy: false,
  demoAuthEnabled: true,
  demoAuthFallbackEnabled: false,
  roqquStagingApiKey: undefined,
  databaseUrl: undefined,
  migrationDatabaseUrl: undefined,
  pgliteDir: '.data/test',
  scoringServiceUrl: 'http://127.0.0.1:8001',
  scoringServiceToken: 'test-token',
  sessionTtlHours: 1,
  nodeEnv: 'test',
};

let app: Awaited<ReturnType<typeof buildApp>>;
let db: PgliteDb;
let scoring: FakeScoring;
let tokenA: string;
let tokenB: string;
let demoResponseA: any;
let sessionCookieA: string;

async function demoSession(displayName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/demo/session',
    payload: { display_name: displayName },
  });
  assert.equal(response.statusCode, 201);
  return {
    data: response.json(),
    cookie: String(response.headers['set-cookie'] ?? ''),
  };
}

before(async () => {
  db = new PgliteDb();
  await migrate(db);
  scoring = new FakeScoring();
  app = await buildApp({ config, db, scoring });
  await app.ready();
  const sessionA = await demoSession('Trader A');
  demoResponseA = sessionA.data;
  sessionCookieA = sessionA.cookie;
  tokenA = demoResponseA.token;
  tokenB = (await demoSession('Trader B')).data.token;
});

after(async () => {
  await app.close();
  await db.close();
});

test('demo sessions return only after the workspace and saved reviews exist', async () => {
  assert.equal(demoResponseA.demo_data.trade_count, 6);
  assert.equal(demoResponseA.demo_data.review_count, 6);

  const trades = await app.inject({
    method: 'GET',
    url: '/v1/trades?limit=200',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(trades.statusCode, 200);
  assert.equal(trades.json().total, 6);

  const firstTradeId = trades.json().items[0].id;
  const reviews = await app.inject({
    method: 'GET',
    url: `/v1/trades/${firstTradeId}/reviews`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(reviews.statusCode, 200);
  assert.equal(reviews.json().reviews.length, 1);
  assert.equal(scoring.calls, 12);
});

test('demo session cookie authenticates protected routes when browser storage omits the bearer header', async () => {
  assert.ok(sessionCookieA.startsWith('miroir_session='));
  assert.ok(sessionCookieA.includes('; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600'));
  assert.doesNotMatch(sessionCookieA, /Secure/);

  const response = await app.inject({
    method: 'GET',
    url: '/v1/progress',
    headers: { cookie: sessionCookieA.split(';', 1)[0] },
  });
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().progress);
});

test('explicit preview-only fallback resolves the latest demo identity without browser storage', async () => {
  const wasEnabled = config.demoAuthFallbackEnabled;
  config.demoAuthFallbackEnabled = true;
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/progress' });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().progress);
  } finally {
    config.demoAuthFallbackEnabled = wasEnabled;
  }
});

test('Roqqu integration reports configuration without calling upstream and fails cleanly when unset', async () => {
  const status = await app.inject({
    method: 'GET',
    url: '/v1/integrations/roqqu/status',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(status.statusCode, 200);
  assert.deepEqual(status.json(), {
    provider: 'roqqu_ras',
    configured: false,
    mode: 'staging',
    liveConnectivity: 'not_checked',
    tradeMapping: 'not_imported',
  });

  const balances = await app.inject({
    method: 'GET',
    url: '/v1/integrations/roqqu/balances',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(balances.statusCode, 503);
  assert.equal(balances.json().error.code, 'ROQQU_NOT_CONFIGURED');
});

test('Roqqu read-only routes send mocked staging requests to official host only', async () => {
  const oldKey = config.roqquStagingApiKey;
  const oldFetch = app.roqquFetch;
  config.roqquStagingApiKey = 'mock-roqqu-key-never-real';
  const requests: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  app.roqquFetch = async (input, init) => {
    requests.push({
      url: new URL(String(input)),
      method: String(init?.method),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    const data = requests.length === 1 ? { balance: { BTC: '1.25' } } : { history: [] };
    return new Response(JSON.stringify({ status: 'success', data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const balance = await app.inject({
      method: 'GET',
      url: '/v1/integrations/roqqu/balances?email=trader%40example.test&token=BTC',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(balance.statusCode, 200);
    assert.deepEqual(balance.json().data, { balance: { BTC: '1.25' } });

    const history = await app.inject({
      method: 'GET',
      url: '/v1/integrations/roqqu/history?email=trader%40example.test&network=bitcoin',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(history.statusCode, 200);
    assert.deepEqual(history.json().data, { history: [] });

    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map((request) => request.url.pathname),
      ['/v1/balances', '/v1/history'],
    );
    for (const request of requests) {
      assert.equal(request.url.origin, 'https://service.roqqu.com');
      assert.equal(request.headers.get('x-staging-api-key'), 'mock-roqqu-key-never-real');
      assert.equal(request.headers.get('x-api-key'), null);
      assert.equal(request.headers.get('authorization'), null);
      assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
      assert.equal(request.headers.get('location'), null);
    }
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body, 'email=trader%40example.test&token=BTC');
    assert.equal(requests[1].method, 'POST');
    assert.equal(requests[1].body, 'email=trader%40example.test&network=bitcoin');
  } finally {
    config.roqquStagingApiKey = oldKey;
    app.roqquFetch = oldFetch;
  }
});

test('demo setup failure removes the incomplete identity and returns a service error', async () => {
  const before = Number((await db.query('SELECT COUNT(*) AS count FROM identities')).rows[0].count);
  scoring.fail = true;
  const response = await app.inject({
    method: 'POST',
    url: '/v1/demo/session',
    payload: { display_name: 'Incomplete demo' },
  });
  scoring.fail = false;

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'DEMO_SETUP_FAILED');
  const after = Number((await db.query('SELECT COUNT(*) AS count FROM identities')).rows[0].count);
  assert.equal(after, before);
});

test('demo session creation is rate limited with the shared error envelope', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/demo/session',
    payload: { display_name: 'Rate limited demo' },
  });
  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error.code, 'TOO_MANY_REQUESTS');
  assert.equal(typeof response.json().error.request_id, 'string');
  assert.deepEqual(response.json().error.details, []);
});

test('health and docs are public', async () => {
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  const docs = await app.inject({ method: 'GET', url: '/docs/json' });
  assert.equal(docs.statusCode, 200);
  const docsUi = await app.inject({ method: 'GET', url: '/docs/' });
  assert.equal(docsUi.statusCode, 200);
  assert.match(docsUi.headers['content-type'] ?? '', /text\/html/);
  const contract = docs.json();
  const methods = ['get', 'post', 'patch', 'put', 'delete'];
  let publicOperationCount = 0;
  for (const [route, pathItem] of Object.entries(contract.paths) as Array<[string, any]>) {
    if (!route.startsWith('/v1/')) continue;
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      publicOperationCount += 1;
      assert.ok(
        operation.responses['400'],
        `${method.toUpperCase()} ${route} needs an error schema`,
      );
      assert.ok(
        Object.keys(operation.responses).some((status) => status.startsWith('2')),
        `${method.toUpperCase()} ${route} needs a success response schema`,
      );
      const errorSchema = operation.responses['400'].content['application/json'].schema;
      const errorProperties = errorSchema.properties.error.properties;
      assert.ok(errorProperties.request_id);
      assert.ok(errorProperties.details);
    }
  }
  assert.ok(publicOperationCount >= 18);
});

test('protected routes use the agreed error envelope', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/strategies' });
  assert.equal(response.statusCode, 401);
  const body = response.json();
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(typeof body.error.request_id, 'string');
  assert.deepEqual(body.error.details, []);
  assert.equal('request_id' in body, false);
});

test('validation errors identify the field and use the agreed envelope', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { name: '', rules: [] },
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'Correct the highlighted fields and try again.');
  assert.equal(typeof body.error.request_id, 'string');
  assert.ok(Array.isArray(body.error.details));
  assert.ok(body.error.details.some((item: { field?: string }) => item.field === 'name'));
  assert.equal('request_id' in body, false);
});

test('unknown endpoints use the agreed error envelope', async () => {
  const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(typeof body.error.request_id, 'string');
  assert.deepEqual(body.error.details, []);
});

test('strategy confirmation creates immutable versions', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Test strategy',
      rules: [
        {
          id: 'risk-limit',
          dimension: 'risk',
          label: 'Risk limit',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
      trading_schedule: {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        start_time: '09:00',
        end_time: '16:00',
        timezone: 'Africa/Lagos',
      },
    },
  });
  assert.equal(created.statusCode, 201);
  const strategy = created.json().strategy;

  const v1 = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategy.id}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(v1.statusCode, 201);
  assert.equal(v1.json().version.version_number, 1);
  assert.equal(v1.json().version.trading_schedule.timezone, 'Africa/Lagos');

  await app.inject({
    method: 'PATCH',
    url: `/v1/strategies/${strategy.id}`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Renamed draft',
      trading_schedule: {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        start_time: '09:00',
        end_time: '15:00',
        timezone: 'Africa/Lagos',
      },
    },
  });

  const v2 = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategy.id}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(v2.statusCode, 201);
  assert.equal(v2.json().version.version_number, 2);
  assert.equal(v1.json().version.trading_schedule.end_time, '16:00');
  assert.equal(v2.json().version.trading_schedule.end_time, '15:00');

  const versions = await app.inject({
    method: 'GET',
    url: `/v1/strategies/${strategy.id}/versions`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(versions.statusCode, 200);
  assert.equal(versions.json().versions.length, 2);
});

test('strategy rejects invalid trading hours and timezone names', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Invalid schedule',
      rules: [
        {
          id: 'risk',
          dimension: 'risk',
          label: 'Risk',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
      trading_schedule: {
        days: ['monday'],
        start_time: '09:00',
        end_time: '09:00',
        timezone: 'Africa/Lagos',
      },
    },
  });
  assert.equal(response.statusCode, 400);
});

test('manual trade computes realized P&L and R multiple', async () => {
  const strategy = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'P&L strategy',
      rules: [
        {
          id: 'risk',
          dimension: 'risk',
          label: 'Risk',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
    },
  });
  const version = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategy.json().strategy.id}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });

  const trade = await app.inject({
    method: 'POST',
    url: '/v1/trades',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      strategy_version_id: version.json().version.id,
      symbol: 'TEST',
      direction: 'long',
      quantity: 10,
      entry_price: 100,
      exit_price: 110,
      fees: 5,
      currency: 'USD',
      opened_at: '2026-10-01T09:00:00Z',
      closed_at: '2026-10-01T10:00:00Z',
      initial_risk_amount: 50,
    },
  });
  assert.equal(trade.statusCode, 201);
  const body = trade.json().trade;
  assert.equal(body.realized_pnl, 95);
  assert.equal(body.r_multiple, 1.9);
});

test('fixed-template CSV preview and commit coexist with manual trade entry', async () => {
  const strategy = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'CSV import strategy',
      rules: [
        {
          id: 'risk',
          dimension: 'risk',
          label: 'Risk limit',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
    },
  });
  const strategyId = strategy.json().strategy.id;
  const confirmed = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategyId}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const strategyVersionId = confirmed.json().version.id;
  const csvText = [
    'symbol,direction,quantity,entry_price,exit_price,fees,currency,opened_at,closed_at,initial_risk_amount,setup_note,emotional_state',
    'AAPL,long,10,100,104,2,USD,2026-10-05T09:15:00Z,2026-10-05T11:00:00Z,80,"Breakout, then retest",calm',
  ].join('\n');

  const before = await app.inject({
    method: 'GET',
    url: '/v1/trades?limit=200',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const countBefore = before.json().total;
  const preview = await app.inject({
    method: 'POST',
    url: '/v1/trade-imports/preview',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { strategy_version_id: strategyVersionId, csv_text: csvText },
  });
  assert.equal(preview.statusCode, 201);
  assert.equal(preview.json().row_count, 1);
  assert.equal(preview.json().rows[0].row_number, 2);
  assert.equal(preview.json().rows[0].evidence[0].payload.setup_note, 'Breakout, then retest');

  const afterPreview = await app.inject({
    method: 'GET',
    url: '/v1/trades?limit=200',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(afterPreview.json().total, countBefore);

  const importId = preview.json().import_id;
  const committed = await app.inject({
    method: 'POST',
    url: `/v1/trade-imports/${importId}/commit`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(committed.statusCode, 201);
  assert.equal(committed.json().imported_count, 1);
  assert.equal(committed.json().cached, false);
  assert.equal(committed.json().trades[0].realized_pnl, 38);

  const repeated = await app.inject({
    method: 'POST',
    url: `/v1/trade-imports/${importId}/commit`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json().cached, true);
  assert.equal(repeated.json().trades[0].id, committed.json().trades[0].id);

  const otherIdentity = await app.inject({
    method: 'POST',
    url: `/v1/trade-imports/${importId}/commit`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(otherIdentity.statusCode, 404);
});

test('CSV validation reports the exact row and field', async () => {
  const strategy = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Invalid CSV strategy',
      rules: [
        {
          id: 'risk',
          dimension: 'risk',
          label: 'Risk limit',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
    },
  });
  const confirmed = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategy.json().strategy.id}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const csvText = [
    'symbol,direction,quantity,entry_price,exit_price,fees,currency,opened_at,closed_at,initial_risk_amount,setup_note,emotional_state',
    'AAPL,long,10,not-a-number,104,2,USD,2026-10-05T09:15:00Z,2026-10-05T11:00:00Z,80,Setup,calm',
  ].join('\n');
  const response = await app.inject({
    method: 'POST',
    url: '/v1/trade-imports/preview',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      strategy_version_id: confirmed.json().version.id,
      csv_text: csvText,
    },
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details[0].row, 2);
  assert.equal(body.error.details[0].field, 'entry_price');
  assert.equal(typeof body.error.request_id, 'string');

  const wrongHeader = await app.inject({
    method: 'POST',
    url: '/v1/trade-imports/preview',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      strategy_version_id: confirmed.json().version.id,
      csv_text: 'direction,symbol\nlong,AAPL',
    },
  });
  assert.equal(wrongHeader.statusCode, 400);
  assert.equal(wrongHeader.json().error.details[0].row, 1);
  assert.equal(wrongHeader.json().error.details[0].field, 'header');
});

test('reviews are idempotent and ownership-isolated', async () => {
  const strategy = await app.inject({
    method: 'POST',
    url: '/v1/strategies',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Review strategy',
      rules: [
        {
          id: 'risk',
          dimension: 'risk',
          label: 'Risk',
          check: { type: 'max_risk_amount', amount: 100 },
        },
      ],
      trading_schedule: {
        days: ['monday'],
        start_time: '09:00',
        end_time: '16:00',
        timezone: 'Africa/Lagos',
      },
    },
  });
  const version = await app.inject({
    method: 'POST',
    url: `/v1/strategies/${strategy.json().strategy.id}/confirm`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const trade = await app.inject({
    method: 'POST',
    url: '/v1/trades',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      strategy_version_id: version.json().version.id,
      symbol: 'TEST',
      direction: 'long',
      quantity: 1,
      entry_price: 100,
      currency: 'USD',
      opened_at: '2026-10-01T09:00:00Z',
      initial_risk_amount: 10,
    },
  });
  const tradeId = trade.json().trade.id;
  const callsBeforeReview = scoring.calls;

  const first = await app.inject({
    method: 'POST',
    url: `/v1/trades/${tradeId}/review`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().cached, false);
  assert.equal(scoring.lastInput?.strategy_version.trading_schedule?.timezone, 'Africa/Lagos');

  const second = await app.inject({
    method: 'POST',
    url: `/v1/trades/${tradeId}/review`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().cached, true);
  assert.equal(second.json().review.id, first.json().review.id);
  assert.equal(scoring.calls, callsBeforeReview + 1);

  const forbidden = await app.inject({
    method: 'POST',
    url: `/v1/trades/${tradeId}/review`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(forbidden.statusCode, 404);

  const readOther = await app.inject({
    method: 'GET',
    url: `/v1/trades/${tradeId}`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(readOther.statusCode, 404);
});

test('stats and progress are scoped to the identity', async () => {
  const stats = await app.inject({
    method: 'GET',
    url: '/v1/stats?currency=USD',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(stats.statusCode, 200);
  assert.ok(stats.json().stats.sample_size >= 1);

  const otherStats = await app.inject({
    method: 'GET',
    url: '/v1/stats?currency=USD',
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(otherStats.statusCode, 200);
  assert.equal(otherStats.json().stats.sample_size, 6);

  const progress = await app.inject({
    method: 'GET',
    url: '/v1/progress',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(progress.statusCode, 200);
  assert.ok(Array.isArray(progress.json().progress.versions));
});
