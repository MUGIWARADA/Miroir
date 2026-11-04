import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Type } from '@sinclair/typebox';
import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import type { Db } from './db/types.js';
import { errorResponses } from './lib/api-schemas.js';
import { registerContext } from './lib/context.js';
import { ApiError } from './lib/errors.js';
import type { ApiErrorDetail } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { reviewRoutes } from './routes/reviews.js';
import { roqquRoutes } from './routes/roqqu.js';
import { statsRoutes } from './routes/stats.js';
import { strategyRoutes } from './routes/strategies.js';
import { tradeImportRoutes } from './routes/trade-imports.js';
import { tradeRoutes } from './routes/trades.js';
import type { ScoringClient } from './services/scoring-client.js';

interface ValidationIssue {
  instancePath?: string;
  dataPath?: string;
  keyword?: string;
  params?: Record<string, unknown>;
  message?: string;
}

function fieldFromIssue(issue: ValidationIssue): string | undefined {
  const pointer = issue.instancePath ?? '';
  const segments = pointer.startsWith('/')
    ? pointer
        .split('/')
        .slice(1)
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    : (issue.dataPath ?? '').replace(/^\\./, '').split('.').filter(Boolean);
  const params = issue.params ?? {};
  const missing = params.missingProperty;
  const extra = params.additionalProperty;
  if (typeof missing === 'string') segments.push(missing);
  if (typeof extra === 'string') segments.push(extra);
  const field = segments.reduce((result, segment) => {
    if (/^\\d+$/.test(segment)) return `${result}[${segment}]`;
    return result ? `${result}.${segment}` : segment;
  }, '');
  return field || undefined;
}

function userValidationMessage(issue: ValidationIssue): string {
  const params = issue.params ?? {};
  switch (issue.keyword) {
    case 'required':
      return 'This field is required.';
    case 'type':
      if (params.type === 'number' || params.type === 'integer') return 'Enter a valid number.';
      if (params.type === 'string') return 'Enter text.';
      return 'Enter a value in the expected format.';
    case 'format':
      return 'Enter a valid value.';
    case 'enum':
      return 'Choose one of the available options.';
    case 'minLength':
      return `Enter at least ${String(params.limit ?? 'the required number of')} characters.`;
    case 'maxLength':
      return `Use no more than ${String(params.limit ?? 'the allowed number of')} characters.`;
    case 'minimum':
    case 'exclusiveMinimum':
      return 'Enter a value above the minimum allowed.';
    case 'maximum':
    case 'exclusiveMaximum':
      return 'Enter a value below the maximum allowed.';
    case 'minItems':
      return 'Add the required number of items.';
    case 'maxItems':
      return 'Remove items until the allowed limit is met.';
    case 'uniqueItems':
      return 'Remove duplicate selections.';
    case 'additionalProperties':
      return 'Remove this unrecognized field.';
    default:
      return 'Check this value.';
  }
}

function validationDetails(issues: ValidationIssue[] = []): ApiErrorDetail[] {
  return issues.map((issue) => {
    const field = fieldFromIssue(issue);
    return {
      ...(field ? { field } : {}),
      message: userValidationMessage(issue),
    };
  });
}

function errorCodeForStatus(statusCode: number): string {
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  if (statusCode === 413) return 'PAYLOAD_TOO_LARGE';
  if (statusCode === 429) return 'TOO_MANY_REQUESTS';
  if (statusCode === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  return 'BAD_REQUEST';
}

export interface AppDeps {
  config: AppConfig;
  db: Db;
  scoring: ScoringClient;
  roqquFetch?: typeof fetch;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: deps.config.nodeEnv === 'test' ? false : { level: 'info' },
    bodyLimit: 1_048_576,
    trustProxy: deps.config.trustProxy,
  });

  await app.register(cors, { origin: deps.config.corsOrigin });
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Miroir Backend API',
        description:
          'Miroir API. Quick start: [create a demo session](#/Auth/post_v1_demo_session), copy the returned Miroir token, then click Authorize and paste that token. Jump to [Roqqu status](#/Integrations/get_v1_integrations_roqqu_status), [balances](#/Integrations/get_v1_integrations_roqqu_balances), or [history](#/Integrations/get_v1_integrations_roqqu_history). Live Roqqu reads require ROQQU_STAGING_API_KEY in the backend environment only; do not paste the Roqqu key into Authorize. These Roqqu operations are read-only.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await registerContext(app, deps);

  app.get(
    '/',
    {
      config: { public: true },
      schema: {
        tags: ['System'],
        summary: 'Redirect to API documentation',
        response: {
          302: {
            type: 'null',
            description: 'Redirect to the API documentation.',
            headers: { Location: { type: 'string', enum: ['/docs'] } },
          },
        },
      },
    },
    async (_request, reply) => reply.redirect('/docs'),
  );

  app.get(
    '/health',
    {
      config: { public: true },
      schema: {
        tags: ['System'],
        summary: 'Check API health',
        response: {
          ...errorResponses,
          200: Type.Object({
            status: Type.Literal('ok'),
            service: Type.String(),
            database: Type.String(),
          }),
        },
      },
    },
    async () => {
      await deps.db.query('SELECT 1');
      return {
        status: 'ok',
        service: 'miroir-backend',
        database: deps.db.kind,
      };
    },
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code.toUpperCase(),
          message: error.message,
          request_id: request.id,
          details: error.details,
        },
      });
    }

    const err = error as Error & { statusCode?: number; validation?: ValidationIssue[] };
    const statusCode = err.statusCode ?? 500;
    if (err.validation?.length) {
      return reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Correct the highlighted fields and try again.',
          request_id: request.id,
          details: validationDetails(err.validation),
        },
      });
    }
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code: errorCodeForStatus(statusCode),
          message:
            statusCode === 413
              ? 'The request is too large.'
              : statusCode === 429
                ? 'Too many demo-session requests. Please wait before trying again.'
                : 'The request could not be processed.',
          request_id: request.id,
          details: [],
        },
      });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error.',
        request_id: request.id,
        details: [],
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint was not found.',
        request_id: request.id,
        details: [],
      },
    });
  });

  await app.register(authRoutes);
  await app.register(strategyRoutes);
  await app.register(tradeRoutes);
  await app.register(tradeImportRoutes);
  await app.register(reviewRoutes);
  await app.register(statsRoutes);
  await app.register(roqquRoutes);

  return app;
}
