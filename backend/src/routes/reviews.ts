import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { ReviewRecordSchema, errorResponses } from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { Uuid } from '../lib/schemas.js';
import { createReview, listTradeReviews } from '../services/reviews.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    '/v1/trades/:id/review',
    {
      schema: {
        tags: ['Reviews'],
        summary: 'Create or return the idempotent deterministic review for a trade',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: Type.Object({ review: ReviewRecordSchema, cached: Type.Boolean() }),
          201: Type.Object({ review: ReviewRecordSchema, cached: Type.Boolean() }),
        },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const result = await createReview(
        { db: app.db, scoring: app.scoring },
        identity.id,
        request.params.id,
      );
      reply.code(result.cached ? 200 : 201);
      return result;
    },
  );

  typed.get(
    '/v1/trades/:id/reviews',
    {
      schema: {
        tags: ['Reviews'],
        summary: 'List saved reviews for a trade',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Uuid }),
        response: {
          ...errorResponses,
          200: Type.Object({ reviews: Type.Array(ReviewRecordSchema) }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return {
        reviews: await listTradeReviews(
          { db: app.db, scoring: app.scoring },
          identity.id,
          request.params.id,
        ),
      };
    },
  );
};
