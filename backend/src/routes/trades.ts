import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import {
  EvidenceRecordSchema,
  TradeRecordSchema,
  TradeWithEvidenceSchema,
  errorResponses,
} from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { DateTime, EvidenceInput, TradeCreate, TradeQuery, Uuid } from '../lib/schemas.js';
import {
  addTradeEvidence,
  closeTrade,
  createTrade,
  getTrade,
  listTrades,
} from '../services/trades.js';

export const tradeRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    '/v1/trades',
    {
      schema: {
        tags: ['Trades'],
        summary: 'Record a manual trade (open or closed) with optional evidence',
        security: [{ bearerAuth: [] }],
        body: TradeCreate,
        response: {
          ...errorResponses,
          201: Type.Object({ trade: TradeRecordSchema }),
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const trade = await createTrade(app.db, identity.id, request.body);
      reply.code(201);
      return { trade };
    },
  );

  typed.get(
    '/v1/trades',
    {
      schema: {
        tags: ['Trades'],
        summary: 'List trades',
        security: [{ bearerAuth: [] }],
        querystring: TradeQuery,
        response: {
          ...errorResponses,
          200: Type.Object({
            items: Type.Array(TradeRecordSchema),
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
          }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return listTrades(app.db, identity.id, request.query);
    },
  );

  typed.get(
    '/v1/trades/:id',
    {
      schema: {
        tags: ['Trades'],
        summary: 'Get a trade with evidence',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: Type.Object({ trade: TradeWithEvidenceSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { trade: await getTrade(app.db, identity.id, request.params.id) };
    },
  );

  typed.post(
    '/v1/trades/:id/evidence',
    {
      schema: {
        tags: ['Trades'],
        summary: 'Attach evidence to a trade',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        body: EvidenceInput,
        response: {
          ...errorResponses,
          201: Type.Object({ evidence: EvidenceRecordSchema }),
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const evidence = await addTradeEvidence(app.db, identity.id, request.params.id, request.body);
      reply.code(201);
      return { evidence };
    },
  );

  typed.post(
    '/v1/trades/:id/close',
    {
      schema: {
        tags: ['Trades'],
        summary: 'Close an open trade and compute realized P&L',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        body: Type.Object({
          exit_price: Type.Number({ exclusiveMinimum: 0 }),
          closed_at: DateTime,
          fees: Type.Optional(Type.Number({ minimum: 0 })),
        }),
        response: {
          ...errorResponses,
          200: Type.Object({ trade: TradeRecordSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { trade: await closeTrade(app.db, identity.id, request.params.id, request.body) };
    },
  );
};
