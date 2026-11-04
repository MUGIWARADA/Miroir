import 'dotenv/config';

export interface AppConfig {
  host: string;
  port: number;
  corsOrigin: string | string[] | boolean;
  trustProxy: boolean;
  demoAuthEnabled: boolean;
  demoAuthFallbackEnabled: boolean;
  roqquStagingApiKey: string | undefined;
  databaseUrl: string | undefined;
  migrationDatabaseUrl: string | undefined;
  pgliteDir: string;
  scoringServiceUrl: string;
  scoringServiceToken: string;
  sessionTtlHours: number;
  nodeEnv: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const rawCorsOrigin = env.CORS_ORIGIN ?? '*';
  const corsOrigin = rawCorsOrigin === '*' ? true : rawCorsOrigin.split(',').map((s) => s.trim());
  const port = Number(env.PORT ?? 8080);
  const sessionTtlHours = Number(env.SESSION_TTL_HOURS ?? 24);
  const trustProxy = bool(env.TRUST_PROXY, false);
  const demoAuthFallbackEnabled = bool(env.DEMO_AUTH_FALLBACK_ENABLED, false);
  const roqquStagingApiKey = env.ROQQU_STAGING_API_KEY?.trim() || undefined;
  const databaseUrl = env.DATABASE_URL || undefined;
  const scoringServiceToken = env.SCORING_SERVICE_TOKEN ?? 'dev-scoring-token';
  const scoringServiceUrl = env.SCORING_SERVICE_URL ?? 'http://127.0.0.1:8001';

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  if (!Number.isFinite(sessionTtlHours) || sessionTtlHours <= 0) {
    throw new Error('SESSION_TTL_HOURS must be a positive number.');
  }
  try {
    const scoringUrl = new URL(scoringServiceUrl);
    if (!['http:', 'https:'].includes(scoringUrl.protocol)) {
      throw new Error('Unsupported URL scheme.');
    }
  } catch {
    throw new Error('SCORING_SERVICE_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (nodeEnv === 'production') {
    if (demoAuthFallbackEnabled) {
      throw new Error('DEMO_AUTH_FALLBACK_ENABLED must be false in production.');
    }
    if (!databaseUrl || !isPostgresUrl(databaseUrl)) {
      throw new Error(
        'Set DATABASE_URL to a valid PostgreSQL URL in production; PGlite is not persistent.',
      );
    }
    if (!env.MIGRATION_DATABASE_URL || !isPostgresUrl(env.MIGRATION_DATABASE_URL)) {
      throw new Error('Set MIGRATION_DATABASE_URL to a valid direct PostgreSQL URL in production.');
    }
    if (
      scoringServiceToken === 'dev-scoring-token' ||
      scoringServiceToken.trim() !== scoringServiceToken ||
      scoringServiceToken.length < 32
    ) {
      throw new Error(
        'Set a unique SCORING_SERVICE_TOKEN of at least 32 characters in production.',
      );
    }
    if (
      corsOrigin === true ||
      (Array.isArray(corsOrigin) &&
        (corsOrigin.length === 0 ||
          corsOrigin.some((origin) => {
            try {
              const url = new URL(origin);
              return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin;
            } catch {
              return true;
            }
          })))
    ) {
      throw new Error('Set CORS_ORIGIN to the exact allowed frontend origin(s) in production.');
    }
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    corsOrigin,
    trustProxy,
    demoAuthEnabled: bool(env.DEMO_AUTH_ENABLED, true),
    demoAuthFallbackEnabled,
    roqquStagingApiKey,
    databaseUrl,
    migrationDatabaseUrl: env.MIGRATION_DATABASE_URL || undefined,
    pgliteDir: env.PGLITE_DIR ?? '.data/pglite',
    scoringServiceUrl,
    scoringServiceToken,
    sessionTtlHours,
    nodeEnv,
  };
}
