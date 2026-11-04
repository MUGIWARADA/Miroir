import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { errorResponses } from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { ApiError } from '../lib/errors.js';
import { RasApiError, RoqquRasClient } from '../services/roqqu-ras-contract.js';

const ProviderSchema = Type.Literal('roqqu_ras');
const ReadResponseSchema = Type.Object({
  provider: ProviderSchema,
  data: Type.Any(),
});

function configuredClient(app: FastifyInstance) {
  const apiKey = app.config.roqquStagingApiKey;
  if (!apiKey) {
    throw new ApiError(
      503,
      'roqqu_not_configured',
      'Roqqu staging credentials are not configured on the backend.',
    );
  }
  return new RoqquRasClient({ apiKey, fetchImpl: app.roqquFetch });
}

function upstreamFailure(
  request: { log: { error: (obj: Record<string, unknown>, message: string) => void } },
  operationId: string,
  error: unknown,
): ApiError {
  request.log.error(
    {
      operation: operationId,
      upstreamStatus: error instanceof RasApiError ? error.statusCode : undefined,
    },
    'Roqqu RAS read request failed',
  );
  return new ApiError(
    502,
    'roqqu_upstream_error',
    'Roqqu RAS could not complete the read request.',
  );
}

export const roqquRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/v1/integrations/roqqu/status',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'Report Roqqu RAS staging configuration without making a network request',
        security: [{ bearerAuth: [] }],
        response: {
          ...errorResponses,
          200: Type.Object({
            provider: ProviderSchema,
            configured: Type.Boolean(),
            mode: Type.Literal('staging'),
            liveConnectivity: Type.Literal('not_checked'),
            tradeMapping: Type.Literal('not_imported'),
          }),
        },
      },
    },
    async (request) => {
      requireIdentity(request);
      return {
        provider: 'roqqu_ras' as const,
        configured: Boolean(app.config.roqquStagingApiKey),
        mode: 'staging' as const,
        liveConnectivity: 'not_checked' as const,
        tradeMapping: 'not_imported' as const,
      };
    },
  );

  typed.get(
    '/v1/integrations/roqqu/balances',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'Read balances from the Roqqu RAS staging account',
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            email: Type.Optional(Type.String({ maxLength: 320 })),
            token: Type.Optional(Type.String({ maxLength: 32 })),
          },
          { additionalProperties: false },
        ),
        response: { ...errorResponses, 200: ReadResponseSchema },
      },
    },
    async (request) => {
      requireIdentity(request);
      const client = configuredClient(app);
      try {
        const data = await client.request('balances.get', request.query);
        return { provider: 'roqqu_ras' as const, data };
      } catch (error) {
        throw upstreamFailure(request, 'balances.get', error);
      }
    },
  );

  typed.get(
    '/v1/integrations/roqqu/history',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'Read ledger transaction history from the Roqqu RAS staging account',
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            email: Type.String({ minLength: 1, maxLength: 320 }),
            token: Type.Optional(Type.String({ maxLength: 32 })),
            network: Type.Optional(Type.String({ maxLength: 64 })),
            direction: Type.Optional(Type.String({ maxLength: 32 })),
            timestamp: Type.Optional(Type.String({ maxLength: 64 })),
            status: Type.Optional(Type.String({ maxLength: 32 })),
          },
          { additionalProperties: false },
        ),
        response: { ...errorResponses, 200: ReadResponseSchema },
      },
    },
    async (request) => {
      requireIdentity(request);
      const client = configuredClient(app);
      try {
        const data = await client.request('history.list', request.query);
        return { provider: 'roqqu_ras' as const, data };
      } catch (error) {
        throw upstreamFailure(request, 'history.list', error);
      }
    },
  );
};
