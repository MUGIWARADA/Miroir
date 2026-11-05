import Fastify from 'fastify';
import cors from '@fastify/cors';
import { evaluateTrade } from './scoring.js';
import { RoqquClient, roqquMockData } from './roqqu.js';
import { createAiAdapter } from './ai-adapter.js';
import { createEmailAdapter } from './email-adapter.js';
import { createOpaqueToken, hashPassword, hashToken, normalizeEmail, verifyPassword } from './security.js';

function bearerToken(request) {
  const sessionHeader = request.headers['x-miroir-session'];
  if (typeof sessionHeader === 'string' && /^([a-f0-9-]{36}|[a-f0-9]{64})$/i.test(sessionHeader)) return sessionHeader;
  const value = request.headers.authorization || '';
  const match = /^Bearer\s+([a-f0-9-]{36}|[a-f0-9]{64})$/i.exec(value);
  return match?.[1] || null;
}

function responseError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

const normalizeIdentity = (identity) => ({
  id: identity.id,
  mode: identity.mode,
  display_name: identity.display_name,
  ...(identity.email ? { email: identity.email } : {}),
  ...(identity.email_verified_at ? { email_verified_at: identity.email_verified_at } : {})
});
const genericVerificationMessage = 'If that address can be registered, a verification link will be sent.';
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export async function createApp({
  store,
  config = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'development', dataMode: 'mock', appBaseUrl: 'http://localhost:5173', sessionTtlHours: 24, verificationTtlMinutes: 30 },
  aiAdapter = createAiAdapter(),
  emailAdapter = createEmailAdapter(config)
}) {
  const app = Fastify({ logger: config.nodeEnv !== 'test' });
  await app.register(cors, { origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Miroir-Session'] });
  const authAttempts = new Map();
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v1/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'API request failed');
    const isApiError = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.code);
    const status = isApiError ? error.statusCode : 500;
    const code = isApiError ? error.code : 'INTERNAL_ERROR';
    const message = isApiError ? error.message : 'An unexpected server error occurred.';
    return reply.code(status).send({ error: { code, message } });
  });

  app.get('/health', async () => ({ status: 'ok', data_mode: config.dataMode }));

  app.post('/v1/demo/session', async (request, reply) => {
    const displayName = typeof request.body?.display_name === 'string' && request.body.display_name.trim()
      ? request.body.display_name.trim().slice(0, 80)
      : 'Demo Trader';
    const session = await store.createDemoSession(displayName);
    return reply.code(201).send(session);
  });

  app.post('/v1/auth/register', async (request, reply) => {
    enforceAuthRateLimit(authAttempts, request, 'register', 5, 60 * 60_000);
    requirePostgresAuth(config);
    const { email, password, display_name: displayName } = request.body || {};
    if (!validEmail(email) || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw responseError('INVALID_REGISTRATION', 'Enter a valid email and a password between 12 and 128 characters.', 400);
    }
    if (!emailAdapter.enabled) throw responseError('EMAIL_DELIVERY_NOT_CONFIGURED', 'Email delivery is not configured for account verification.', 503);
    const verificationToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + config.verificationTtlMinutes * 60_000).toISOString();
    const identity = await store.registerUser({
      email: normalizeEmail(email),
      passwordHash: await hashPassword(password),
      displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 80) : 'Miroir Trader',
      verificationTokenHash: hashToken(verificationToken),
      verificationExpiresAt: expiresAt
    });
    if (identity) await sendVerificationEmail(emailAdapter, config.appBaseUrl, email, verificationToken);
    return reply.code(202).send({ message: genericVerificationMessage });
  });

  app.post('/v1/auth/verification/resend', async (request, reply) => {
    enforceAuthRateLimit(authAttempts, request, 'resend', 3, 60 * 60_000);
    requirePostgresAuth(config);
    const email = request.body?.email;
    if (!validEmail(email)) return reply.code(202).send({ message: genericVerificationMessage });
    if (!emailAdapter.enabled) throw responseError('EMAIL_DELIVERY_NOT_CONFIGURED', 'Email delivery is not configured for account verification.', 503);
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + config.verificationTtlMinutes * 60_000).toISOString();
    const userId = await store.createVerificationTokenForEmail(email, hashToken(token), expiresAt);
    if (userId) await sendVerificationEmail(emailAdapter, config.appBaseUrl, email, token);
    return reply.code(202).send({ message: genericVerificationMessage });
  });

  app.post('/v1/auth/verify', async (request) => {
    enforceAuthRateLimit(authAttempts, request, 'verify', 10, 30 * 60_000);
    requirePostgresAuth(config);
    const token = request.body?.token;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw responseError('INVALID_VERIFICATION_TOKEN', 'Verification link is invalid or expired.', 400);
    const identity = await store.verifyEmailToken(hashToken(token));
    if (!identity) throw responseError('INVALID_VERIFICATION_TOKEN', 'Verification link is invalid or expired.', 400);
    return store.createUserSession(identity.id, config.sessionTtlHours);
  });

  app.post('/v1/auth/login', async (request) => {
    enforceAuthRateLimit(authAttempts, request, 'login', 10, 15 * 60_000);
    requirePostgresAuth(config);
    const { email, password } = request.body || {};
    if (!validEmail(email) || typeof password !== 'string') throw responseError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    const user = await store.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) throw responseError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    if (!user.email_verified_at) throw responseError('EMAIL_NOT_VERIFIED', 'Verify your email before signing in. You can request a new verification link.', 403);
    return store.createUserSession(user.id, config.sessionTtlHours);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    await requireIdentity(request, store);
    const token = bearerToken(request);
    if (token && typeof store.revokeSession === 'function') await store.revokeSession(token);
    return reply.code(204).send();
  });

  app.get('/v1/me', async (request) => {
    const identity = await requireIdentity(request, store);
    return { identity: normalizeIdentity(identity) };
  });

  app.get('/v1/strategies', async (request) => {
    const identity = await requireIdentity(request, store);
    return store.getStrategies(identity.id);
  });

  app.get('/v1/trades', async (request) => {
    const identity = await requireIdentity(request, store);
    return store.listTrades(identity.id);
  });

  app.post('/v1/trades', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw responseError('INVALID_TRADE', 'A trade object is required.', 400);
    const payload = request.body;
    if (typeof payload.symbol !== 'string' || !payload.symbol.trim()) throw responseError('INVALID_TRADE', 'symbol is required.', 400);
    if (payload.evidence !== undefined && !Array.isArray(payload.evidence)) throw responseError('INVALID_TRADE', 'evidence must be an array.', 400);
    const cleanPayload = { ...payload, symbol: payload.symbol.trim().toUpperCase() };
    for (const field of ['id', 'identity_id', 'strategy_id', 'created_at', 'review']) delete cleanPayload[field];
    const trade = await store.createTrade(identity.id, cleanPayload);
    return reply.code(201).send({ trade });
  });

  app.post('/v1/trades/:id/review', async (request) => {
    const identity = await requireIdentity(request, store);
    const trade = await store.getTrade(identity.id, request.params.id);
    if (!trade) throw responseError('TRADE_NOT_FOUND', 'Trade not found.', 404);
    const cached = await store.getReview(identity.id, trade.id);
    if (cached) return { review: cached, cached: true };
    const strategies = await store.getStrategies(identity.id);
    const strategy = strategies.strategies.find((item) => item.id === trade.strategy_id) || strategies.strategies[0];
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'No strategy is available to assess this trade.', 409);
    const result = evaluateTrade(trade, strategy);
    result.ai_explanation = await aiAdapter.explain({ trade, review: result });
    const review = await store.saveReview(identity.id, trade.id, result);
    if (!review) throw responseError('TRADE_NOT_FOUND', 'Trade not found.', 404);
    return { review, cached: false };
  });

  app.get('/v1/stats', async (request) => {
    const identity = await requireIdentity(request, store);
    const currency = typeof request.query.currency === 'string' ? request.query.currency.toUpperCase() : 'USD';
    if (currency !== 'USD') throw responseError('UNSUPPORTED_CURRENCY', 'Only USD statistics are currently supported.', 400);
    return { stats: await store.getStats(identity.id, currency) };
  });

  app.get('/v1/progress', async (request) => {
    const identity = await requireIdentity(request, store);
    return store.getProgress(identity.id);
  });

  app.get('/v1/roqqu/status', async (request) => {
    const identity = await requireIdentity(request, store);
    if (config.dataMode === 'mock') {
      return { provider: 'roqqu_ras', configured: true, connected: true, enabled: true, connectable: false, mode: 'mock', sample_data: true, refresh_mode: 'on_demand', access_model: 'sample_data', writes_enabled: false };
    }
    const isVerifiedUser = identity.mode === 'user' && Boolean(identity.email_verified_at);
    const connection = isVerifiedUser ? await store.getRoqquConnection(identity.id) : null;
    const keyConfigured = Boolean(config.roqquStagingApiKey);
    return {
      provider: 'roqqu_ras', configured: keyConfigured, connected: Boolean(connection),
      enabled: Boolean(connection && keyConfigured), connectable: Boolean(isVerifiedUser && keyConfigured && !connection),
      auth_required: !isVerifiedUser, mode: 'staging', sample_data: false, refresh_mode: 'on_demand',
      access_model: isVerifiedUser ? 'verified_user_email' : 'user_auth_required', writes_enabled: false
    };
  });

  app.post('/v1/roqqu/connect', async (request, reply) => {
    const identity = await requireVerifiedUserIdentity(request, store);
    if (config.dataMode !== 'postgres') throw responseError('ROQQU_ACCESS_DISABLED', 'Connect a verified user account in PostgreSQL mode.', 403);
    if (!config.roqquStagingApiKey) throw responseError('ROQQU_NOT_CONFIGURED', 'The backend staging API key is not configured.', 503);
    const connection = await store.connectRoqqu(identity.id);
    if (!connection) throw responseError('ROQQU_CONNECTION_FAILED', 'Could not connect this verified email to Roqqu.', 409);
    return reply.code(201).send({ connection: { provider: 'roqqu_ras', connected: true, connected_at: connection.connected_at }, writes_enabled: false });
  });

  app.post('/v1/roqqu/disconnect', async (request, reply) => {
    const identity = await requireVerifiedUserIdentity(request, store);
    if (config.dataMode !== 'postgres') throw responseError('ROQQU_ACCESS_DISABLED', 'Live Roqqu connections require PostgreSQL mode.', 403);
    await store.disconnectRoqqu(identity.id);
    return reply.code(204).send();
  });

  app.get('/v1/roqqu/balances', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (config.dataMode === 'mock') {
      await requireIdentity(request, store);
      return { provider: 'roqqu_ras', mode: 'mock', sample_data: true, ...roqquMockData().balances };
    }
    const connection = await requireRoqquConnection(request, store, config);
    const client = new RoqquClient({ stagingApiKey: config.roqquStagingApiKey, accountEmail: connection.account_email });
    return { provider: 'roqqu_ras', mode: 'staging', sample_data: false, ...(await client.getBalances()) };
  });

  app.get('/v1/roqqu/history', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (config.dataMode === 'mock') {
      await requireIdentity(request, store);
      return { provider: 'roqqu_ras', mode: 'mock', sample_data: true, ...roqquMockData().history };
    }
    const connection = await requireRoqquConnection(request, store, config);
    const client = new RoqquClient({ stagingApiKey: config.roqquStagingApiKey, accountEmail: connection.account_email });
    const filters = Object.fromEntries(['token', 'network', 'direction', 'timestamp', 'status'].filter((key) => request.query[key] !== undefined).map((key) => [key, request.query[key]]));
    return { provider: 'roqqu_ras', mode: 'staging', sample_data: false, ...(await client.getHistory(filters)) };
  });

  return app;
}

async function sendVerificationEmail(emailAdapter, appBaseUrl, email, token) {
  const url = new URL('/', appBaseUrl);
  url.searchParams.set('verify', token);
  try { await emailAdapter.sendVerification({ email: normalizeEmail(email), url: url.toString() }); }
  catch { throw responseError('EMAIL_DELIVERY_FAILED', 'Could not send the verification email. Try again later.', 503); }
}

function requirePostgresAuth(config) {
  if (config.dataMode !== 'postgres') throw responseError('AUTH_REQUIRES_POSTGRES', 'User accounts require DATA_MODE=postgres.', 503);
}

function enforceAuthRateLimit(buckets, request, action, maxAttempts, windowMs) {
  const now = Date.now();
  const key = `${action}:${request.ip}`;
  const current = buckets.get(key);
  if (current && current.resetAt > now && current.count >= maxAttempts) {
    throw responseError('RATE_LIMITED', 'Too many account requests. Try again later.', 429);
  }
  buckets.set(key, current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + windowMs });
  if (buckets.size > 5000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
}

async function requireIdentity(request, store) {
  const token = bearerToken(request);
  const identity = token ? await store.authenticate(token) : null;
  if (!identity) throw responseError('UNAUTHENTICATED', 'A valid Miroir session is required.', 401);
  return identity;
}

async function requireVerifiedUserIdentity(request, store) {
  const identity = await requireIdentity(request, store);
  if (identity.mode !== 'user' || !identity.email_verified_at) throw responseError('VERIFIED_USER_REQUIRED', 'A verified Miroir user account is required.', 403);
  return identity;
}

async function requireRoqquConnection(request, store, config) {
  const identity = await requireVerifiedUserIdentity(request, store);
  if (config.dataMode !== 'postgres') throw responseError('ROQQU_ACCESS_DISABLED', 'Live Roqqu reads require PostgreSQL mode.', 403);
  if (!config.roqquStagingApiKey) throw responseError('ROQQU_NOT_CONFIGURED', 'The backend staging API key is not configured.', 503);
  const connection = await store.getRoqquConnection(identity.id);
  if (!connection) throw responseError('ROQQU_NOT_CONNECTED', 'Connect your verified account before requesting Roqqu data.', 409);
  return connection;
}
