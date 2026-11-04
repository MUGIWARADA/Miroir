import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { DemoSessionResponseSchema, IdentitySchema, errorResponses } from '../lib/api-schemas.js';
import { requireIdentity } from '../lib/context.js';
import { ApiError, forbidden } from '../lib/errors.js';
import { newToken, sha256 } from '../lib/ids.js';
import { seedDemoData } from '../services/demo-data.js';

function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `miroir_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function expiredSessionCookie(secure: boolean): string {
  return [
    'miroir_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    '/v1/demo/session',
    {
      config: {
        public: true,
        rateLimit: { max: 3, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Create an isolated demo identity and bearer token',
        body: Type.Object({
          display_name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
        }),
        response: { ...errorResponses, 201: DemoSessionResponseSchema },
      },
    },
    async (request, reply) => {
      if (!app.config.demoAuthEnabled) forbidden('Demo authentication is disabled');
      const displayName = request.body?.display_name?.trim() || 'Demo trader';
      const token = newToken();
      const expiresAt = new Date(Date.now() + app.config.sessionTtlHours * 3600 * 1000);

      const identity = await app.db.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO identities (mode, display_name) VALUES ('demo', $1) RETURNING id, mode, display_name`,
          [displayName],
        );
        const row = inserted.rows[0];
        await tx.query(
          'INSERT INTO sessions (identity_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          [row.id, sha256(token), expiresAt.toISOString()],
        );
        return row;
      });

      let demoData: Awaited<ReturnType<typeof seedDemoData>>;
      try {
        demoData = await seedDemoData(app.db, app.scoring, identity.id);
      } catch (error) {
        request.log.error({ err: error, identityId: identity.id }, 'Failed to prepare demo data');
        try {
          await app.db.query('DELETE FROM identities WHERE id = $1', [identity.id]);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, identityId: identity.id },
            'Failed to remove incomplete demo identity',
          );
        }
        throw new ApiError(
          503,
          'demo_setup_failed',
          'Could not prepare the demo workspace. Please try again.',
        );
      }

      reply.header(
        'Set-Cookie',
        sessionCookie(
          token,
          Math.floor(app.config.sessionTtlHours * 3600),
          app.config.nodeEnv === 'production',
        ),
      );
      reply.code(201);
      return {
        token,
        token_type: 'Bearer' as const,
        expires_at: expiresAt.toISOString(),
        identity,
        demo_data: {
          strategy_id: demoData.strategy_id,
          strategy_version_id: demoData.strategy_version_id,
          trade_count: demoData.trade_count,
          review_count: demoData.review_count,
        },
      };
    },
  );

  typed.get(
    '/v1/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Return the current identity',
        security: [{ bearerAuth: [] }],
        response: {
          ...errorResponses,
          200: Type.Object({ identity: IdentitySchema }),
        },
      },
    },
    async (request) => {
      const identity = requireIdentity(request);
      return { identity };
    },
  );

  typed.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Revoke the current bearer token',
        security: [{ bearerAuth: [] }],
        response: { ...errorResponses, 204: Type.Null() },
      },
    },
    async (request, reply) => {
      const identity = requireIdentity(request);
      const header = request.headers.authorization ?? '';
      const token = header.slice('Bearer '.length).trim();
      await app.db.query('DELETE FROM sessions WHERE token_hash = $1 AND identity_id = $2', [
        sha256(token),
        identity.id,
      ]);
      reply.header('Set-Cookie', expiredSessionCookie(app.config.nodeEnv === 'production'));
      reply.code(204);
      return null;
    },
  );
};
