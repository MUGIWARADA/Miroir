import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, createOpaqueToken, hashToken, normalizeEmail } from '../src/security.js';
import { createEmailAdapter } from '../src/email-adapter.js';

test('passwords are salted scrypt hashes and verification is timing-safe', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

test('opaque tokens are high entropy, hashable, and email normalization is stable', () => {
  const token = createOpaqueToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), token);
  assert.equal(normalizeEmail(' Trader@Example.COM '), 'trader@example.com');
});

test('development verification links are logged only by the local console adapter', async () => {
  const entries = [];
  const adapter = createEmailAdapter({ emailDeliveryMode: 'console', nodeEnv: 'development' }, { info: (...args) => entries.push(args) });
  await adapter.sendVerification({ email: 'trader@example.com', url: 'http://localhost:5173/?verify=one-time-token' });
  assert.equal(adapter.enabled, true);
  assert.equal(entries.length, 1);
  const productionAdapter = createEmailAdapter({ emailDeliveryMode: 'console', nodeEnv: 'production' });
  assert.equal(productionAdapter.enabled, false);
});
