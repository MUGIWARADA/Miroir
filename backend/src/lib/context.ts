import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/types.js';
import type { ScoringClient } from '../services/scoring-client.js';
import { unauthorized } from './errors.js';
import { sha256 } from './ids.js';

export interface Identity {
  id: string;
  mode: 'demo' | 'verified';
  display_name: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: Db;
    scoring: ScoringClient;
    roqquFetch: typeof fetch;
  }
  interface FastifyRequest {
    identity: Identity | null;
  }
}

function sessionCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== 'miroir_session') continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function registerContext(
  app: FastifyInstance,
  deps: { config: AppConfig; db: Db; scoring: ScoringClient; roqquFetch?: typeof fetch },
): Promise<void> {
  app.decorate('config', deps.config);
  app.decorate('db', deps.db);
  app.decorate('scoring', deps.scoring);
  app.decorate('roqquFetch', deps.roqquFetch ?? fetch);
  app.decorateRequest('identity', null);

  app.addHook('onRequest', async (request) => {
    const routeConfig = request.routeOptions.config as { public?: boolean } | undefined;
    if (routeConfig?.public) return;
    if (!request.url.startsWith('/v1/')) return;

    const header = request.headers.authorization;
    const bearerToken = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : undefined;
    const cookieToken = sessionCookieToken(request.headers.cookie);
    const candidates = [bearerToken, cookieToken].filter((token): token is string =>
      Boolean(token),
    );
    if (candidates.length === 0 && app.config.demoAuthFallbackEnabled) {
      const fallback = await app.db.query<{
        id: string;
        mode: 'demo' | 'verified';
        display_name: string;
      }>(
        `SELECT i.id, i.mode, i.display_name
         FROM sessions s
         JOIN identities i ON i.id = s.identity_id
         WHERE i.mode = 'demo' AND s.expires_at > now()
         ORDER BY s.expires_at DESC
         LIMIT 1`,
      );
      const demoIdentity = fallback.rows[0];
      if (demoIdentity) {
        request.identity = demoIdentity;
        return;
      }
    }

    if (candidates.length === 0) {
      request.log.warn(
        {
          path: request.url.split('?')[0],
          authHeader: header ? 'malformed-or-empty' : 'missing',
          sessionCookie: cookieToken ? 'present' : 'missing',
        },
        'Request rejected: bearer token unavailable',
      );
      unauthorized();
    }

    for (const token of candidates) {
      const result = await app.db.query<{
        id: string;
        mode: 'demo' | 'verified';
        display_name: string;
      }>(
        `SELECT i.id, i.mode, i.display_name
         FROM sessions s
         JOIN identities i ON i.id = s.identity_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [sha256(token)],
      );
      const row = result.rows[0];
      if (row) {
        request.identity = row;
        return;
      }
    }

    request.log.warn(
      {
        path: request.url.split('?')[0],
        authHeader: bearerToken ? 'present-but-not-recognized' : 'missing',
        sessionCookie: cookieToken ? 'present-but-not-recognized' : 'missing',
      },
      'Request rejected: bearer token unavailable',
    );
    unauthorized();
  });
}

export function requireIdentity(request: { identity: Identity | null }): Identity {
  if (!request.identity) unauthorized();
  return request.identity;
}
