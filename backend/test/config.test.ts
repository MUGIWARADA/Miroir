import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

const safeProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: '8080',
  CORS_ORIGIN: 'https://frontend.example',
  DATABASE_URL: 'postgresql://db.example/app',
  MIGRATION_DATABASE_URL: 'postgresql://db.example/app',
  SCORING_SERVICE_URL: 'http://miroir-scoring:10000',
  SCORING_SERVICE_TOKEN: 'a'.repeat(48),
  SESSION_TTL_HOURS: '24',
  TRUST_PROXY: 'true',
};

test('Roqqu staging key is read from backend environment and trimmed', () => {
  assert.equal(loadConfig(safeProductionEnv).roqquStagingApiKey, undefined);
  const config = loadConfig({ ...safeProductionEnv, ROQQU_STAGING_API_KEY: '  test-only-key  ' });
  assert.equal(config.roqquStagingApiKey, 'test-only-key');
});

test('anonymous demo-auth fallback is disabled by default and forbidden in production', () => {
  assert.equal(loadConfig({ ...safeProductionEnv }).demoAuthFallbackEnabled, false);
  assert.throws(
    () => loadConfig({ ...safeProductionEnv, DEMO_AUTH_FALLBACK_ENABLED: 'true' }),
    /must be false in production/,
  );
});

test('production config requires a persistent database', () => {
  const env = { ...safeProductionEnv, DATABASE_URL: '' };
  assert.throws(() => loadConfig(env), /valid PostgreSQL URL in production/);
});

test('production config requires a separate direct migration URL', () => {
  const env = { ...safeProductionEnv, MIGRATION_DATABASE_URL: '' };
  assert.throws(() => loadConfig(env), /valid direct PostgreSQL URL in production/);
});

test('production config rejects the development scoring token', () => {
  const env = { ...safeProductionEnv, SCORING_SERVICE_TOKEN: 'dev-scoring-token' };
  assert.throws(() => loadConfig(env), /unique SCORING_SERVICE_TOKEN/);
});

test('production config rejects wildcard browser access', () => {
  const env = { ...safeProductionEnv, CORS_ORIGIN: '*' };
  assert.throws(() => loadConfig(env), /exact allowed frontend origin/);
});

test('scoring service URL must use HTTP or HTTPS', () => {
  assert.throws(
    () => loadConfig({ ...safeProductionEnv, SCORING_SERVICE_URL: 'file:///tmp/scoring' }),
    /absolute HTTP or HTTPS URL/,
  );
});

test('production config accepts explicit database, token, CORS, and proxy settings', () => {
  const config = loadConfig({ ...safeProductionEnv, TRUST_PROXY_HOPS: '1' });
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.databaseUrl, safeProductionEnv.DATABASE_URL);
  assert.equal(Array.isArray(config.corsOrigin), true);
  assert.equal(config.trustProxy, true);
});
