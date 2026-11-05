import Fastify from 'fastify';
import cors from '@fastify/cors';
import { evaluateTrade } from './scoring.js';
import { RoqquClient, roqquMockData } from './roqqu.js';
import { createAiAdapter, createOpenRouterProvider } from './ai-adapter.js';
import { createStrategyCompanionEngine, extractProvidedUpdates } from './strategy-companion.js';
import { createProgressCompanionEngine } from './progress-companion.js';
import { validateStrategy, VALIDATION_STATUS } from './strategy-validator.js';
import { detectTradingPatterns } from './pattern-engine.js';
import { createEmailAdapter } from './email-adapter.js';
import { createOpaqueToken, hashPassword, hashToken, normalizeEmail, verifyPassword } from './security.js';

function bearerToken(request) {
  const sessionHeader = request.headers['x-miroir-session'];
  if (typeof sessionHeader === 'string' && /^([a-f0-9-]{36}|[a-f0-9]{64})$/i.test(sessionHeader)) return sessionHeader;
  const value = request.headers.authorization || '';
  const match = /^Bearer\s+([a-f0-9-]{36}|[a-f0-9]{64})$/i.exec(value);
  return match?.[1] || null;
}

function responseError(code, message, statusCode, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details) error.details = details;
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

function validateStrategyRules(rules) {
  if (!Array.isArray(rules)) throw responseError('INVALID_STRATEGY', 'draft_rules must be an array.', 400);
  const allowedDimensions = ['risk', 'sizing', 'plan', 'timing', 'emotion'];
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') throw responseError('INVALID_STRATEGY', 'Each rule must be an object.', 400);
    if (typeof rule.id !== 'string' || !rule.id.trim()) throw responseError('INVALID_STRATEGY', 'Rule id is required.', 400);
    if (!allowedDimensions.includes(rule.dimension)) throw responseError('INVALID_STRATEGY', `Rule dimension must be one of: ${allowedDimensions.join(', ')}.`, 400);
    if (typeof rule.label !== 'string' || !rule.label.trim()) throw responseError('INVALID_STRATEGY', 'Rule label is required.', 400);
    if (!rule.check || typeof rule.check !== 'object') throw responseError('INVALID_STRATEGY', 'Rule check configuration is required.', 400);
  }
}

function validateTradingSchedule(schedule) {
  if (schedule === null || schedule === undefined) return;
  if (typeof schedule !== 'object' || Array.isArray(schedule)) throw responseError('INVALID_STRATEGY', 'draft_trading_schedule must be an object.', 400);
  if (!Array.isArray(schedule.days)) throw responseError('INVALID_STRATEGY', 'draft_trading_schedule.days must be an array of days.', 400);
  if (typeof schedule.start_time !== 'string' || !/^\d{2}:\d{2}$/.test(schedule.start_time)) throw responseError('INVALID_STRATEGY', 'draft_trading_schedule.start_time must be HH:MM format.', 400);
  if (typeof schedule.end_time !== 'string' || !/^\d{2}:\d{2}$/.test(schedule.end_time)) throw responseError('INVALID_STRATEGY', 'draft_trading_schedule.end_time must be HH:MM format.', 400);
}

export async function createApp({
  store,
  config = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'development', dataMode: 'mock', appBaseUrl: 'http://localhost:5173', sessionTtlHours: 24, verificationTtlMinutes: 30 },
  aiAdapter,
  emailAdapter = createEmailAdapter(config),
  companionEngine,
  progressEngine
}) {
  const resolvedAiAdapter = aiAdapter || createAiAdapter(createOpenRouterProvider(config));
  const resolvedCompanionEngine = companionEngine || createStrategyCompanionEngine(config);
  const resolvedProgressEngine = progressEngine || createProgressCompanionEngine({ store, aiAdapter: resolvedAiAdapter });
  const app = Fastify({ logger: config.nodeEnv !== 'test' });
  await app.register(cors, { origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Miroir-Session'] });
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
    return reply.code(status).send({
      error: {
        code,
        message,
        ...(error.details ? { details: error.details } : {})
      }
    });
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

  app.post('/v1/strategies', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    const {
      name,
      description,
      status,
      draft_rules,
      draft_trading_schedule,
      markets,
      timeframes,
      entry_conditions,
      stop_loss_method,
      exit_plan,
      risk_rules,
      position_sizing_rules,
      other_restrictions,
      preferences
    } = request.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      throw responseError('INVALID_STRATEGY', 'name is required and must be at most 100 characters.', 400);
    }
    if (draft_rules !== undefined) validateStrategyRules(draft_rules);
    if (draft_trading_schedule !== undefined) validateTradingSchedule(draft_trading_schedule);
    const strategy = await store.createStrategy(identity.id, {
      name: name.trim(),
      description: typeof description === 'string' ? description.slice(0, 500) : '',
      status: status || 'confirmed',
      draft_rules: Array.isArray(draft_rules) ? draft_rules : [],
      draft_trading_schedule: draft_trading_schedule || null,
      markets: Array.isArray(markets) ? markets : [],
      timeframes: Array.isArray(timeframes) ? timeframes : [],
      entry_conditions: Array.isArray(entry_conditions) ? entry_conditions : [],
      stop_loss_method: stop_loss_method && typeof stop_loss_method === 'object' ? stop_loss_method : {},
      exit_plan: exit_plan && typeof exit_plan === 'object' ? exit_plan : {},
      risk_rules: Array.isArray(risk_rules) ? risk_rules : [],
      position_sizing_rules: Array.isArray(position_sizing_rules) ? position_sizing_rules : [],
      other_restrictions: Array.isArray(other_restrictions) ? other_restrictions : [],
      preferences: Array.isArray(preferences) ? preferences : []
    });
    return reply.code(201).send({ strategy });
  });

  app.get('/v1/strategies/:id', async (request) => {
    const identity = await requireIdentity(request, store);
    const strategy = await store.getStrategy(identity.id, request.params.id);
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
    return { strategy };
  });

  app.put('/v1/strategies/:id', async (request) => {
    const identity = await requireIdentity(request, store);
    const {
      name,
      description,
      draft_rules,
      draft_trading_schedule,
      markets,
      timeframes,
      entry_conditions,
      stop_loss_method,
      exit_plan,
      risk_rules,
      position_sizing_rules,
      other_restrictions,
      preferences
    } = request.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
      throw responseError('INVALID_STRATEGY', 'name must be a non-empty string up to 100 characters.', 400);
    }
    if (draft_rules !== undefined) validateStrategyRules(draft_rules);
    if (draft_trading_schedule !== undefined) validateTradingSchedule(draft_trading_schedule);
    try {
      const updated = await store.updateStrategyDraft(identity.id, request.params.id, {
        name,
        description: typeof description === 'string' ? description.slice(0, 500) : undefined,
        draft_rules,
        draft_trading_schedule,
        markets,
        timeframes,
        entry_conditions,
        stop_loss_method,
        exit_plan,
        risk_rules,
        position_sizing_rules,
        other_restrictions,
        preferences
      });
      if (!updated) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
      return { strategy: updated };
    } catch (err) {
      if (err.message?.startsWith('INVALID_LIFECYCLE_TRANSITION')) {
        throw responseError('INVALID_LIFECYCLE_TRANSITION', err.message, 400);
      }
      throw err;
    }
  });

  app.post('/v1/strategies/:id/submit-review', async (request) => {
    const identity = await requireIdentity(request, store);
    try {
      const strategy = await store.submitStrategyForReview(identity.id, request.params.id);
      if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
      return { strategy };
    } catch (err) {
      if (err.message?.startsWith('INVALID_LIFECYCLE_TRANSITION')) {
        throw responseError('INVALID_LIFECYCLE_TRANSITION', err.message, 400);
      }
      throw err;
    }
  });

  app.get('/v1/strategies/:id/validation', async (request) => {
    const identity = await requireIdentity(request, store);
    const strategy = await store.getStrategy(identity.id, request.params.id);
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
    const validation = validateStrategy(strategy);
    return { strategy, validation };
  });

  app.post('/v1/strategies/:id/explain-validation', async (request) => {
    const identity = await requireIdentity(request, store);
    const strategy = await store.getStrategy(identity.id, request.params.id);
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
    const validation = validateStrategy(strategy);
    if (validation.status === VALIDATION_STATUS.COMPLETE) {
      return {
        status: 'complete',
        explanation: 'Your strategy is complete, internally consistent, and ready for baseline confirmation.',
        validation
      };
    }
    const issueSummaries = validation.issues.map((i) => `• [${i.severity.toUpperCase()}] ${i.field}: ${i.message} Suggestion: ${i.suggestion}`).join('\n');
    return {
      status: validation.status,
      explanation: `Miroir Strategy Validation identified the following points:\n${issueSummaries}`,
      validation
    };
  });

  app.post('/v1/strategies/:id/confirm', async (request) => {
    const identity = await requireIdentity(request, store);
    const strategy = await store.getStrategy(identity.id, request.params.id);
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
    if (strategy.status === 'archived') {
      throw responseError('INVALID_LIFECYCLE_TRANSITION', 'Cannot confirm an archived strategy.', 400);
    }

    const validation = validateStrategy(strategy);
    const acknowledgeAmbiguity = Boolean(request.body?.acknowledge_ambiguity || request.body?.acknowledge_warnings);

    if (validation.status === VALIDATION_STATUS.CONTRADICTORY) {
      throw responseError(
        'STRATEGY_CONTRADICTORY',
        'Strategy contains contradictory rules that must be resolved before confirmation.',
        400,
        { validation }
      );
    }

    if (validation.status === VALIDATION_STATUS.INCOMPLETE) {
      throw responseError(
        'STRATEGY_INCOMPLETE',
        `Strategy is incomplete. Missing required fields: ${validation.missing_fields.join(', ')}.`,
        400,
        { validation }
      );
    }

    if (validation.status === VALIDATION_STATUS.AMBIGUOUS && !acknowledgeAmbiguity) {
      throw responseError(
        'STRATEGY_AMBIGUOUS',
        'Strategy contains ambiguous or subjective rules. Clarify them or acknowledge warnings to proceed.',
        400,
        { validation }
      );
    }

    const changeSummary = typeof request.body?.change_summary === 'string'
      ? request.body.change_summary.slice(0, 300)
      : undefined;

    try {
      const result = await store.confirmStrategyVersion(identity.id, request.params.id, {
        change_summary: changeSummary
      });
      if (!result) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
      return { ...result, validation };
    } catch (err) {
      if (err.message?.startsWith('INVALID_LIFECYCLE_TRANSITION')) {
        throw responseError('INVALID_LIFECYCLE_TRANSITION', err.message, 400);
      }
      throw err;
    }
  });

  app.post('/v1/strategies/:id/archive', async (request) => {
    const identity = await requireIdentity(request, store);
    try {
      const strategy = await store.archiveStrategy(identity.id, request.params.id);
      if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
      return { strategy };
    } catch (err) {
      if (err.message?.startsWith('INVALID_LIFECYCLE_TRANSITION')) {
        throw responseError('INVALID_LIFECYCLE_TRANSITION', err.message, 400);
      }
      throw err;
    }
  });

  app.get('/v1/strategies/:id/versions', async (request) => {
    const identity = await requireIdentity(request, store);
    const versions = await store.getStrategyVersions(identity.id, request.params.id);
    if (!versions) throw responseError('STRATEGY_NOT_FOUND', 'Strategy not found.', 404);
    return versions;
  });

  app.get('/v1/strategies/:id/versions/:versionId', async (request) => {
    const identity = await requireIdentity(request, store);
    const version = await store.getStrategyVersion(identity.id, request.params.id, request.params.versionId);
    if (!version) throw responseError('VERSION_NOT_FOUND', 'Strategy version not found.', 404);
    return { version };
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
    if (!payload.strategy_id || typeof payload.strategy_id !== 'string') {
      throw responseError('STRATEGY_REQUIRED', 'A valid strategy_id is required to record a trade.', 400);
    }
    if (payload.evidence !== undefined && !Array.isArray(payload.evidence)) throw responseError('INVALID_TRADE', 'evidence must be an array.', 400);
    
    const strat = await store.getStrategy(identity.id, payload.strategy_id);
    if (!strat) throw responseError('STRATEGY_NOT_FOUND', 'Specified strategy does not exist.', 400);
    if (!strat.current_version_id) {
      throw responseError('STRATEGY_NOT_CONFIRMED', 'Strategy must have a confirmed version before recording trades.', 400);
    }
    if (payload.strategy_version_id) {
      const v = await store.getStrategyVersion(identity.id, strat.id, payload.strategy_version_id);
      if (!v) throw responseError('VERSION_NOT_FOUND', 'Specified strategy version does not exist.', 400);
    }

    const cleanPayload = { ...payload, symbol: payload.symbol.trim().toUpperCase() };
    for (const field of ['id', 'identity_id', 'created_at', 'review']) delete cleanPayload[field];
    const trade = await store.createTrade(identity.id, cleanPayload);
    return reply.code(201).send({ trade });
  });

  app.get('/v1/trades/:id/review', async (request) => {
    const identity = await requireIdentity(request, store);
    const trade = await store.getTrade(identity.id, request.params.id);
    if (!trade) throw responseError('TRADE_NOT_FOUND', 'Trade not found.', 404);
    const review = await store.getReview(identity.id, trade.id);
    if (!review) throw responseError('REVIEW_NOT_FOUND', 'No review found for this trade.', 404);
    return { review };
  });

  app.post('/v1/trades/:id/review', async (request) => {
    const identity = await requireIdentity(request, store);
    const trade = await store.getTrade(identity.id, request.params.id);
    if (!trade) throw responseError('TRADE_NOT_FOUND', 'Trade not found.', 404);

    const reEvaluate = request.query?.re_evaluate === 'true' ||
      request.query?.re_evaluate === true ||
      request.body?.re_evaluate === true;

    const cached = await store.getReview(identity.id, trade.id);
    if (cached && !reEvaluate) return { review: cached, cached: true };

    let strategy = null;
    if (trade.strategy_id && trade.strategy_version_id && typeof store.getStrategyVersion === 'function') {
      const version = await store.getStrategyVersion(identity.id, trade.strategy_id, trade.strategy_version_id);
      if (version) {
        strategy = {
          id: version.strategy_id,
          name: version.name,
          draft_rules: version.rules,
          draft_trading_schedule: version.trading_schedule,
          current_version_id: version.id
        };
      }
    }
    if (!strategy) {
      const strategies = await store.getStrategies(identity.id);
      strategy = strategies.strategies.find((item) => item.id === trade.strategy_id) || strategies.strategies[0];
    }
    if (!strategy) throw responseError('STRATEGY_NOT_FOUND', 'No strategy is available to assess this trade.', 409);

    const result = evaluateTrade(trade, strategy);
    result.ai_explanation = await resolvedAiAdapter.explain({ trade, review: result, strategy });
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

  app.get('/v1/intelligence/patterns', async (request) => {
    const identity = await requireIdentity(request, store);
    const { start_date, end_date, strategy_id, strategy_version_id, explain } = request.query || {};

    const { trades = [] } = await store.listTrades(identity.id);
    const { strategies = [] } = await store.getStrategies(identity.id);

    // Retrieve reviews for these trades
    const reviews = [];
    for (const trade of trades) {
      if (trade.review) {
        reviews.push(trade.review);
      } else {
        const rev = await store.getReview(identity.id, trade.id);
        if (rev) reviews.push(rev);
      }
    }

    const report = detectTradingPatterns({
      trades,
      reviews,
      strategies,
      filter: {
        startDate: start_date,
        endDate: end_date,
        strategyId: strategy_id,
        strategyVersionId: strategy_version_id
      }
    });

    let aiExplanation = null;
    if (explain === 'true' || explain === true) {
      aiExplanation = await resolvedAiAdapter.interpretPatterns(report);
    }

    return {
      patterns: report,
      ai_explanation: aiExplanation
    };
  });

  app.get('/v1/progress', async (request) => {
    const identity = await requireIdentity(request, store);
    return store.getProgress(identity.id);
  });

  app.post('/v1/ai/conversations', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    const { title, context_type, context_id, strategy_id } = request.body || {};
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      throw responseError('INVALID_CONVERSATION', 'title must be a non-empty string.', 400);
    }
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : 'Discipline Coaching';
    const safeContextType = ['general', 'trade_review', 'strategy_refinement', 'weekly_coaching'].includes(context_type)
      ? context_type
      : 'general';
    if (strategy_id) {
      const strat = await store.getStrategy(identity.id, strategy_id);
      if (!strat) throw responseError('STRATEGY_NOT_FOUND', 'Specified strategy does not exist.', 400);
    }
    const conversation = await store.createConversation(identity.id, {
      title: safeTitle,
      context_type: safeContextType,
      context_id: typeof context_id === 'string' ? context_id.slice(0, 100) : null,
      strategy_id: typeof strategy_id === 'string' ? strategy_id : null
    });
    return reply.code(201).send({ conversation });
  });

  app.get('/v1/ai/conversations', async (request) => {
    const identity = await requireIdentity(request, store);
    const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 20;
    return store.listConversations(identity.id, { limit: Number.isFinite(limit) ? limit : 20 });
  });

  app.get('/v1/ai/conversations/:id', async (request) => {
    const identity = await requireIdentity(request, store);
    const conversation = await store.getConversation(identity.id, request.params.id);
    if (!conversation) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
    return { conversation };
  });

  app.post('/v1/ai/conversations/:id/messages', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    const { role, content, metadata } = request.body || {};
    if (role && role !== 'user') {
      throw responseError('INVALID_MESSAGE_ROLE', 'Client messages must have role user.', 400);
    }
    if (typeof content !== 'string' || !content.trim() || content.length > 8000) {
      throw responseError('INVALID_MESSAGE_CONTENT', 'Message content is required and must not exceed 8000 characters.', 400);
    }
    const message = await store.createMessage(identity.id, request.params.id, {
      role: 'user',
      content: content.trim(),
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
    });
    if (!message) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
    return reply.code(201).send({ message });
  });

  app.get('/v1/ai/conversations/:id/messages', async (request) => {
    const identity = await requireIdentity(request, store);
    const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50;
    const result = await store.getConversationMessages(identity.id, request.params.id, {
      limit: Number.isFinite(limit) ? limit : 50
    });
    if (!result) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
    return result;
  });

  app.post('/v1/ai/conversations/:id/companion-turn', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    const conversation = await store.getConversation(identity.id, request.params.id);
    if (!conversation) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

    const { content, strategy_id } = request.body || {};
    if (typeof content !== 'string' || !content.trim() || content.length > 8000) {
      throw responseError('INVALID_MESSAGE_CONTENT', 'Message content is required and must not exceed 8000 characters.', 400);
    }

    let targetStrategyId = strategy_id || conversation.strategy_id;
    let strategy = null;
    if (targetStrategyId) {
      strategy = await store.getStrategy(identity.id, targetStrategyId);
    }
    if (!strategy) {
      const { strategies = [] } = await store.getStrategies(identity.id);
      if (strategies.length > 0) {
        strategy = strategies[0];
      } else {
        strategy = await store.createStrategy(identity.id, {
          name: 'My Trading Strategy',
          status: 'draft',
          description: 'Strategy defined with Miroir Strategy Companion'
        });
      }
    }

    const userMessage = await store.createMessage(identity.id, conversation.id, {
      role: 'user',
      content: content.trim()
    });

    const msgHistory = await store.getConversationMessages(identity.id, conversation.id, { limit: 20 });

    const turnResult = await resolvedCompanionEngine.executeTurn({
      strategy,
      messages: msgHistory?.messages || [],
      userInput: content.trim()
    });

    const updates = extractProvidedUpdates(turnResult, strategy);
    let updatedStrategy = strategy;
    if (Object.keys(updates).length > 0 && strategy.status !== 'archived') {
      try {
        const res = await store.updateStrategyDraft(identity.id, strategy.id, updates);
        if (res) updatedStrategy = res;
      } catch (err) {
        request.log.warn({ err }, 'Failed to auto-update strategy draft from companion extraction');
      }
    }

    const assistantMessage = await store.createMessage(identity.id, conversation.id, {
      role: 'assistant',
      content: turnResult.assistant_message,
      metadata: {
        question_focus: turnResult.question_focus,
        extraction: turnResult.strategy_extraction,
        suggestions: turnResult.suggestions || [],
        strategy_id: updatedStrategy.id,
        turn_status: turnResult.status
      }
    });

    return reply.code(200).send({
      user_message: userMessage,
      assistant_message: assistantMessage,
      strategy: updatedStrategy,
      extraction: turnResult.strategy_extraction,
      question_focus: turnResult.question_focus,
      suggestions: turnResult.suggestions || [],
      status: turnResult.status
    });
  });

  app.get('/v1/ai/conversations/:id/strategy-state', async (request) => {
    const identity = await requireIdentity(request, store);
    const conversation = await store.getConversation(identity.id, request.params.id);
    if (!conversation) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

    let strategy = null;
    if (conversation.strategy_id) {
      strategy = await store.getStrategy(identity.id, conversation.strategy_id);
    }
    if (!strategy) {
      const { strategies = [] } = await store.getStrategies(identity.id);
      strategy = strategies[0] || null;
    }

    const msgList = await store.getConversationMessages(identity.id, conversation.id, { limit: 50 });
    let latestExtraction = null;
    const assistantMsgs = (msgList?.messages || []).filter((m) => m.role === 'assistant' && m.metadata?.extraction);
    if (assistantMsgs.length > 0) {
      latestExtraction = assistantMsgs[assistantMsgs.length - 1].metadata.extraction;
    }

    return {
      conversation,
      strategy,
      extraction: latestExtraction,
      messages: msgList?.messages || []
    };
  });

  app.post('/v1/ai/conversations/:id/progress-turn', async (request, reply) => {
    const identity = await requireIdentity(request, store);
    const conversation = await store.getConversation(identity.id, request.params.id);
    if (!conversation) throw responseError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

    const { question, strategy_id } = request.body || {};
    if (typeof question !== 'string' || !question.trim() || question.length > 8000) {
      throw responseError('INVALID_QUESTION', 'Question is required and must not exceed 8000 characters.', 400);
    }

    // Save user message
    const userMessage = await store.createMessage(identity.id, conversation.id, {
      role: 'user',
      content: question.trim()
    });

    const targetStrategyId = strategy_id || conversation.strategy_id || null;

    // Execute Progress Companion turn
    const progressResult = await resolvedProgressEngine.executeTurn({
      identityId: identity.id,
      conversationId: conversation.id,
      question: question.trim(),
      strategyId: targetStrategyId
    });

    // Save assistant response message with evidence metadata
    const assistantMessage = await store.createMessage(identity.id, conversation.id, {
      role: 'assistant',
      content: progressResult.answer,
      metadata: {
        observed_facts: progressResult.observed_facts,
        confidence_level: progressResult.confidence_level,
        data_limitations: progressResult.data_limitations,
        coaching_recommendation: progressResult.coaching_recommendation,
        suggested_followups: progressResult.suggested_followups,
        pattern_snapshot: progressResult.pattern_snapshot
      }
    });

    return reply.code(200).send({
      user_message: userMessage,
      assistant_message: assistantMessage,
      answer: progressResult.answer,
      observed_facts: progressResult.observed_facts,
      confidence_level: progressResult.confidence_level,
      data_limitations: progressResult.data_limitations,
      coaching_recommendation: progressResult.coaching_recommendation,
      suggested_followups: progressResult.suggested_followups,
      pattern_snapshot: progressResult.pattern_snapshot
    });
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
