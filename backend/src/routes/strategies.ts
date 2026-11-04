import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { StrategyRecordSchema, StrategyVersionSchema, errorResponses } from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { StrategyRules, TradingSchedule, Uuid } from '../lib/schemas.js';
import {
  confirmStrategy,
  createStrategy,
  getStrategy,
  listStrategies,
  listStrategyVersions,
  updateStrategyDraft,
} from '../services/strategies.js';

const StrategyBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  rules: StrategyRules,
  trading_schedule: Type.Optional(TradingSchedule),
});

const DraftUpdateBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  rules: Type.Optional(StrategyRules),
  trading_schedule: Type.Optional(Type.Union([TradingSchedule, Type.Null()])),
});

export const strategyRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    '/v1/strategies',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'Create a strategy draft',
        security: [{ bearerAuth: [] }],
        body: StrategyBody,
        response: {
          ...errorResponses,
          201: Type.Object({ strategy: StrategyRecordSchema }),
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const strategy = await createStrategy(app.db, identity.id, request.body);
      reply.code(201);
      return { strategy };
    },
  );

  typed.get(
    '/v1/strategies',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'List strategies',
        security: [{ bearerAuth: [] }],
        response: {
          ...errorResponses,
          200: Type.Object({ strategies: Type.Array(StrategyRecordSchema) }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { strategies: await listStrategies(app.db, identity.id) };
    },
  );

  typed.get(
    '/v1/strategies/:id',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'Get a strategy',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: Type.Object({ strategy: StrategyRecordSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { strategy: await getStrategy(app.db, identity.id, request.params.id) };
    },
  );

  typed.patch(
    '/v1/strategies/:id',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'Update a strategy draft (does not change confirmed versions)',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        body: DraftUpdateBody,
        response: {
          ...errorResponses,
          200: Type.Object({ strategy: StrategyRecordSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return {
        strategy: await updateStrategyDraft(app.db, identity.id, request.params.id, request.body),
      };
    },
  );

  typed.post(
    '/v1/strategies/:id/confirm',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'Confirm the current draft as a new immutable strategy version',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          201: Type.Object({ version: StrategyVersionSchema }),
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const version = await confirmStrategy(app.db, identity.id, request.params.id);
      reply.code(201);
      return { version };
    },
  );

  typed.get(
    '/v1/strategies/:id/versions',
    {
      schema: {
        tags: ['Strategies'],
        summary: 'List confirmed strategy versions',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: Type.Object({ versions: Type.Array(StrategyVersionSchema) }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { versions: await listStrategyVersions(app.db, identity.id, request.params.id) };
    },
  );
};
