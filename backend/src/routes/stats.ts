import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { ProgressSchema, StatsSchema, errorResponses } from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { ProgressQuery, StatsQuery } from '../lib/schemas.js';
import { getProgress, getStats } from '../services/stats.js';

export const statsRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/v1/stats',
    {
      schema: {
        tags: ['Stats'],
        summary: 'Classic stats for closed realized trades in one currency',
        security: [{ bearerAuth: [] }],
        querystring: StatsQuery,
        response: {
          ...errorResponses,
          200: Type.Object({ stats: StatsSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { stats: await getStats(app.db, identity.id, request.query) };
    },
  );

  typed.get(
    '/v1/progress',
    {
      schema: {
        tags: ['Stats'],
        summary: 'Rule-adherence progress by strategy version',
        security: [{ bearerAuth: [] }],
        querystring: ProgressQuery,
        response: {
          ...errorResponses,
          200: Type.Object({ progress: ProgressSchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { progress: await getProgress(app.db, identity.id, request.query) };
    },
  );
};
