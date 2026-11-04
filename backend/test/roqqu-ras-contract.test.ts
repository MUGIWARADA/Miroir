import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RAS_ENDPOINTS,
  RasApiError,
  type RasEndpointContract,
  RoqquRasClient,
} from '../src/services/roqqu-ras-contract.js';

const TEST_KEY = 'mock-only-not-a-real-key';
const BASE_URL = 'https://service.roqqu.com/v1';

function sampleValue(field: string): unknown {
  if (field === 'amount') return '0.0001';
  if (field === 'status') return '1';
  if (field === 'wallets') return [{ network: 'bitcoin', token: 'BTC' }];
  if (field === 'customer' || field === 'customer_details') {
    return { email: 'fixture@example.test', first_name: 'Fixture', last_name: 'User' };
  }
  if (field === 'timestamp') return '2026-11-04';
  if (field === 'email') return 'fixture@example.test';
  if (field === 'address') return 'fixture-address';
  if (field === 'tx_hash') return 'fixture-tx-hash';
  return `fixture-${field}`;
}

function requestValues(operation: RasEndpointContract): Record<string, unknown> {
  const fields = [
    ...(operation.pathParams || []),
    ...(operation.queryFields || []),
    ...(operation.bodyFields || []),
  ];
  return Object.fromEntries(fields.map((field) => [field, sampleValue(field)]));
}

function sampleData(operation: RasEndpointContract): unknown {
  if (operation.responseData === 'null') return null;
  if (operation.responseData === 'unknown') return { mock: true };
  if (operation.responseData === 'array') {
    return operation.responseItemFields?.length
      ? [
          Object.fromEntries(
            operation.responseItemFields.map((field) => [field, `fixture-${field}`]),
          ),
        ]
      : [];
  }
  return Object.fromEntries(
    (operation.responseFields || []).map((field) => [field, `fixture-${field}`]),
  );
}

test('RAS contract inventory covers the 40 documented HTTP endpoints without duplicates', () => {
  assert.equal(RAS_ENDPOINTS.length, 40);
  assert.equal(new Set(RAS_ENDPOINTS.map((operation) => operation.id)).size, RAS_ENDPOINTS.length);
  assert.equal(
    new Set(RAS_ENDPOINTS.map((operation) => `${operation.method} ${operation.path}`)).size,
    RAS_ENDPOINTS.length,
  );
  for (const operation of RAS_ENDPOINTS) {
    assert.match(operation.docs, /^https:\/\/roqqu-api-services\.gitbook\.io\/ras\//);
    assert.match(operation.path, /^\//);
    assert.ok(operation.effect);
  }
});

test('RAS client refuses to send credentials to non-official hosts or non-HTTPS URLs', () => {
  assert.throws(
    () => new RoqquRasClient({ apiKey: TEST_KEY, baseUrl: 'https://example.com/v1' }),
    /restricted to https:\/\/service\.roqqu\.com\/v1/,
  );
  assert.throws(
    () => new RoqquRasClient({ apiKey: TEST_KEY, baseUrl: 'http://service.roqqu.com/v1' }),
    /restricted to https:\/\/service\.roqqu\.com\/v1/,
  );
  assert.throws(
    () => new RoqquRasClient({ apiKey: TEST_KEY, baseUrl: 'https://service.roqqu.com/v2' }),
    /restricted to https:\/\/service\.roqqu\.com\/v1/,
  );
});

test('every documented request shape is exercised with a mocked fetch only', async () => {
  let mockRequestCount = 0;
  let blockedUndocumentedCount = 0;

  for (const operation of RAS_ENDPOINTS) {
    const values = requestValues(operation);
    if (operation.encoding === 'undocumented' && operation.bodyFields?.length) {
      const client = new RoqquRasClient({
        apiKey: TEST_KEY,
        baseUrl: BASE_URL,
        fetchImpl: async () => {
          throw new Error('This fetch must not be called for an undocumented body encoding.');
        },
      });
      await assert.rejects(client.request(operation.id, values), /refusing to guess/);
      blockedUndocumentedCount += 1;
      continue;
    }

    let capturedUrl: URL | null = null;
    let capturedMethod = '';
    let capturedHeaders = new Headers();
    let capturedBody: string | undefined;
    let capturedRedirect: RequestRedirect | undefined;
    const client = new RoqquRasClient({
      apiKey: TEST_KEY,
      baseUrl: BASE_URL,
      fetchImpl: async (input, init) => {
        mockRequestCount += 1;
        capturedUrl = new URL(String(input));
        capturedMethod = String(init?.method);
        capturedHeaders = new Headers(init?.headers);
        capturedBody = typeof init?.body === 'string' ? init.body : undefined;
        capturedRedirect = init?.redirect;
        return new Response(
          JSON.stringify({
            status: 'success',
            message: 'mocked contract success',
            data: sampleData(operation),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const result = await client.request(operation.id, values);
    assert.deepEqual(result, sampleData(operation), `${operation.id}: response fixture shape`);
    assert.ok(capturedUrl, `${operation.id}: request was captured`);
    const expectedPath = operation.path.replace(/:[^/]+/g, (placeholder) =>
      encodeURIComponent(String(values[placeholder.slice(1)])),
    );
    assert.equal(
      capturedUrl.origin + capturedUrl.pathname,
      `${new URL(BASE_URL).origin}/v1${expectedPath}`,
    );
    assert.equal(capturedMethod, operation.method);
    assert.equal(capturedRedirect, 'error', 'do not follow redirects with the secret header');
    assert.equal(
      capturedUrl.searchParams.size,
      operation.queryFields?.filter((field) => values[field] !== undefined).length || 0,
    );
    assert.equal(
      capturedHeaders.get('x-api-key'),
      null,
      'test mode must not use the live-key header',
    );
    assert.equal(
      capturedHeaders.get('x-staging-api-key'),
      operation.auth === 'public' ? null : TEST_KEY,
    );
    assert.equal(capturedUrl.href.includes(TEST_KEY), false);
    assert.equal(capturedBody?.includes(TEST_KEY) || false, false);

    if (operation.encoding === 'form') {
      assert.equal(capturedHeaders.get('content-type'), 'application/x-www-form-urlencoded');
      const form = new URLSearchParams(capturedBody || '');
      for (const field of operation.bodyFields || [])
        assert.ok(form.has(field), `${operation.id}: form field ${field}`);
    } else if (operation.encoding === 'json') {
      assert.equal(capturedHeaders.get('content-type'), 'application/json');
      const json = JSON.parse(capturedBody || '{}') as Record<string, unknown>;
      for (const field of operation.bodyFields || [])
        assert.ok(field in json, `${operation.id}: JSON field ${field}`);
    } else {
      assert.equal(capturedBody, undefined, `${operation.id}: body should be omitted`);
    }
  }

  assert.equal(mockRequestCount, 39);
  assert.equal(blockedUndocumentedCount, 1);
});

test('required parameters are checked locally and unsupported extra fields are rejected', async () => {
  const client = new RoqquRasClient({
    apiKey: TEST_KEY,
    fetchImpl: async () =>
      new Response(JSON.stringify({ status: 'success', data: null }), { status: 200 }),
  });

  await assert.rejects(
    client.request('trade.buy', { amount: '0.0001' }),
    /Missing required parameter: token/,
  );
  await assert.rejects(
    client.request('trade.buy', { amount: '0.0001', token: 'btc', password: 'should-not-be-sent' }),
    /Unexpected parameter: password/,
  );
  await assert.rejects(client.request('not-a-real-endpoint'), /Unknown RAS operation/);
});

test('mocked failures and malformed responses do not expose the configured key', async () => {
  const failed = new RoqquRasClient({
    apiKey: TEST_KEY,
    fetchImpl: async () =>
      new Response(JSON.stringify({ status: 'fail', message: 'fixture failure' }), { status: 400 }),
  });
  await assert.rejects(
    failed.request('trade.buy', { amount: '0.0001', token: 'btc' }),
    (error: unknown) => {
      assert.ok(error instanceof RasApiError);
      assert.equal(error.message.includes(TEST_KEY), false);
      return true;
    },
  );

  const malformed = new RoqquRasClient({
    apiKey: TEST_KEY,
    fetchImpl: async () =>
      new Response(JSON.stringify({ status: 'success', data: {} }), { status: 200 }),
  });
  await assert.rejects(malformed.request('tokens.list'), /missing documented data fields/);
});
