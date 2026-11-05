export function loadConfig(env = process.env) {
  const dataMode = (env.DATA_MODE || 'mock').toLowerCase();
  if (!['mock', 'postgres'].includes(dataMode)) throw new Error('DATA_MODE must be mock or postgres.');
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (dataMode === 'postgres' && !env.DATABASE_URL) throw new Error('DATABASE_URL is required when DATA_MODE=postgres.');
  const nodeEnv = env.NODE_ENV || 'development';
  const emailDeliveryMode = env.EMAIL_DELIVERY_MODE || (nodeEnv === 'production' ? 'smtp' : 'console');
  if (!['console', 'smtp'].includes(emailDeliveryMode)) throw new Error('EMAIL_DELIVERY_MODE must be console or smtp.');
  const openRouterTimeout = Number(env.OPENROUTER_TIMEOUT_SECONDS || 15);
  if (!Number.isFinite(openRouterTimeout) || openRouterTimeout < 1 || openRouterTimeout > 120) {
    throw new Error('OPENROUTER_TIMEOUT_SECONDS must be a number between 1 and 120.');
  }
  return {
    dataMode,
    port,
    host: env.HOST || '127.0.0.1',
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean),
    sessionTtlHours: Number(env.SESSION_TTL_HOURS || 24),
    verificationTtlMinutes: Number(env.VERIFICATION_TTL_MINUTES || 30),
    databaseUrl: env.DATABASE_URL,
    nodeEnv,
    appBaseUrl: env.APP_BASE_URL || 'http://localhost:5173',
    emailDeliveryMode,
    smtpHost: env.SMTP_HOST || '',
    smtpPort: Number(env.SMTP_PORT || 587),
    smtpSecure: env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER || '',
    smtpPassword: env.SMTP_PASSWORD || '',
    smtpFrom: env.SMTP_FROM || '',
    roqquStagingApiKey: env.ROQQU_STAGING_API_KEY || '',
    openRouterApiKey: env.OPENROUTER_API_KEY || '',
    openRouterModel: env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    openRouterBaseUrl: (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    openRouterTimeoutSeconds: openRouterTimeout
  };
}
