-- Miroir MVP initial schema.
-- identities/sessions are auth infrastructure. Owned records use forced RLS.

CREATE TABLE IF NOT EXISTS identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'verified')),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_identity_idx ON sessions(identity_id);

CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  draft_rules JSONB NOT NULL,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  rules JSONB NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version_number)
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  quantity NUMERIC(28, 10) NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(28, 10) NOT NULL CHECK (entry_price > 0),
  exit_price NUMERIC(28, 10) CHECK (exit_price > 0),
  fees NUMERIC(28, 10) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  currency TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  initial_risk_amount NUMERIC(28, 10) CHECK (initial_risk_amount > 0),
  realized_pnl NUMERIC(28, 10),
  r_multiple NUMERIC(28, 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (closed_at IS NULL AND exit_price IS NULL AND realized_pnl IS NULL AND r_multiple IS NULL)
    OR (closed_at IS NOT NULL AND exit_price IS NOT NULL AND realized_pnl IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS trades_identity_closed_idx ON trades(identity_id, closed_at);
CREATE INDEX IF NOT EXISTS trades_strategy_version_idx ON trades(strategy_version_id);

CREATE TABLE IF NOT EXISTS trade_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_evidence_trade_idx ON trade_evidence(trade_id);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  input_hash TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  decision_quality_score NUMERIC(5, 2) CHECK (decision_quality_score BETWEEN 0 AND 100),
  coverage_pct NUMERIC(5, 2) NOT NULL CHECK (coverage_pct BETWEEN 0 AND 100),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id, input_hash)
);
CREATE INDEX IF NOT EXISTS reviews_trade_idx ON reviews(trade_id);
CREATE INDEX IF NOT EXISTS reviews_strategy_version_idx ON reviews(strategy_version_id);

-- Row-level security for identity-owned records.
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies FORCE ROW LEVEL SECURITY;
ALTER TABLE strategy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;
ALTER TABLE trade_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_isolation ON strategies;
CREATE POLICY identity_isolation ON strategies
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);

DROP POLICY IF EXISTS identity_isolation ON strategy_versions;
CREATE POLICY identity_isolation ON strategy_versions
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);

DROP POLICY IF EXISTS identity_isolation ON trades;
CREATE POLICY identity_isolation ON trades
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);

DROP POLICY IF EXISTS identity_isolation ON trade_evidence;
CREATE POLICY identity_isolation ON trade_evidence
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);

DROP POLICY IF EXISTS identity_isolation ON reviews;
CREATE POLICY identity_isolation ON reviews
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);
