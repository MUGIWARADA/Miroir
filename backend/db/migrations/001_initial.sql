CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users(lower(email));

CREATE TABLE IF NOT EXISTS identities (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'user')),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((mode = 'demo' AND user_id IS NULL) OR (mode = 'user' AND user_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_identity_idx ON sessions(identity_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rules JSONB NOT NULL,
  trading_schedule JSONB NOT NULL,
  current_version_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identity_id, id)
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(identity_id, strategy_id) REFERENCES strategies(identity_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS trades_identity_created_idx ON trades(identity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id)
);

CREATE TABLE IF NOT EXISTS roqqu_connections (
  identity_id UUID PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  account_email TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL DEFAULT 'roqqu_ras' CHECK (provider = 'roqqu_ras')
);
