import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import {
  TradeImportCommitResponseSchema,
  TradeImportPreviewResponseSchema,
  errorResponses,
} from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { TradeCsvPreview, Uuid } from '../lib/schemas.js';
import { commitTradeImport, previewTradeImport } from '../services/trade-imports.js';

export const tradeImportRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    '/v1/trade-imports/preview',
    {
      schema: {
        tags: ['Trade Imports'],
        summary: 'Parse and validate the fixed-template trade CSV without creating trades',
        security: [{ bearerAuth: [] }],
        body: TradeCsvPreview,
        response: {
          ...errorResponses,
          201: TradeImportPreviewResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const preview = await previewTradeImport(
        app.db,
        identity.id,
        request.body.strategy_version_id,
        request.body.csv_text,
      );
      reply.code(201);
      return preview;
    },
  );

  typed.post(
    '/v1/trade-imports/:id/commit',
    {
      schema: {
        tags: ['Trade Imports'],
        summary: 'Commit every row in a validated preview as one atomic import',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: TradeImportCommitResponseSchema,
          201: TradeImportCommitResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const result = await commitTradeImport(app.db, identity.id, request.params.id);
      reply.code(result.cached ? 200 : 201);
      return result;
    },
  );
};
