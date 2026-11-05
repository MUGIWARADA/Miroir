import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { PostgresStore } from '../src/postgres-store.js';
import { hashToken } from '../src/security.js';

const databaseUrl = process.env.DATABASE_URL;
test('Postgres mode persists demo data, verified users, sessions, and per-user Roqqu ownership', { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const config = {
    corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'postgres',
    sessionTtlHours: 24, verificationTtlMinutes: 30, appBaseUrl: 'http://localhost:5173',
    roqquStagingApiKey: 'test-only-key'
  };
  const store = new PostgresStore(pool);
  const testEmail = `trader-${randomUUID()}@example.com`;
  let identityIds = [];
  let verificationUrl = null;
  const emailAdapter = { enabled: true, async sendVerification(message) { verificationUrl = message.url; } };
  const app = await createApp({ store, config, emailAdapter });
  try {
    const demoResponse = await app.inject({ method: 'POST', url: '/v1/demo/session' });
    assert.equal(demoResponse.statusCode, 201);
    const demo = demoResponse.json(); identityIds.push(demo.identity.id);
    const demoHeaders = { authorization: `Bearer ${demo.token}` };
    const list = await app.inject({ method: 'GET', url: '/v1/trades', headers: demoHeaders });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().trades.length, 3);
    const progress = await app.inject({ method: 'GET', url: '/v1/progress', headers: demoHeaders });
    assert.equal(progress.statusCode, 200);
    assert.equal(progress.json().progress.versions[0].assessed_trades, 3);

    const registration = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email: testEmail.toUpperCase(), password: 'very-secure-password-123', display_name: 'Trader' }
    });
    assert.equal(registration.statusCode, 202);
    assert.ok(verificationUrl);
    const unverifiedLogin = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: testEmail, password: 'very-secure-password-123' } });
    assert.equal(unverifiedLogin.statusCode, 403);
    assert.equal(unverifiedLogin.json().error.code, 'EMAIL_NOT_VERIFIED');
    const verificationToken = new URL(verificationUrl).searchParams.get('verify');
    const verifiedResponse = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { token: verificationToken } });
    assert.equal(verifiedResponse.statusCode, 200);
    const userSession = verifiedResponse.json();
    identityIds.push(userSession.identity.id);
    assert.equal(userSession.identity.mode, 'user');
    assert.equal(userSession.identity.email, testEmail);
    assert.ok(userSession.identity.email_verified_at);
    const loginResponse = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: testEmail.toUpperCase(), password: 'very-secure-password-123' } });
    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.json().identity.email, testEmail);
    const userHeaders = { authorization: `Bearer ${userSession.token}` };
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: userHeaders });
    assert.equal(me.json().identity.email, testEmail);
    assert.equal(Object.hasOwn(me.json().identity, 'password_hash'), false);

    // A login session was created after email verification; select by the exact token hash,
    // not by created_at ordering (timestamps can tie at database precision).
    const expectedSessionHash = hashToken(userSession.token);
    const sessionHash = await pool.query('SELECT token_hash FROM sessions WHERE identity_id=$1 AND token_hash=$2', [userSession.identity.id, expectedSessionHash]);
    assert.equal(sessionHash.rows[0]?.token_hash, expectedSessionHash);
    assert.notEqual(sessionHash.rows[0].token_hash, userSession.token);

    const connection = await app.inject({ method: 'POST', url: '/v1/roqqu/connect', headers: userHeaders, payload: { account_email: 'other@example.com' } });
    assert.equal(connection.statusCode, 201);
    const savedConnection = await store.getRoqquConnection(userSession.identity.id);
    assert.equal(savedConnection.account_email, testEmail);
    const status = await app.inject({ method: 'GET', url: '/v1/roqqu/status', headers: userHeaders });
    assert.equal(status.json().connected, true);
    assert.equal(status.json().enabled, true);
    assert.equal(status.json().access_model, 'verified_user_email');

    const revoked = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: userHeaders });
    assert.equal(revoked.statusCode, 204);
    const afterLogout = await app.inject({ method: 'GET', url: '/v1/me', headers: userHeaders });
    assert.equal(afterLogout.statusCode, 401);
  } finally {
    await app.close();
    for (const identityId of identityIds) await pool.query('DELETE FROM identities WHERE id=$1', [identityId]);
    await pool.query('DELETE FROM users WHERE email=$1', [testEmail]);
    await pool.end();
  }
});
