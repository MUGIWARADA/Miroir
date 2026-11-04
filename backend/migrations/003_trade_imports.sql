-- Temporary, identity-owned staging for fixed-template CSV trade imports.
CREATE TABLE IF NOT EXISTS trade_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  status TEXT NOT NULL CHECK (status IN ('ready', 'committed')),
  normalized_rows JSONB NOT NULL CHECK (jsonb_typeof(normalized_rows) = 'array'),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trade_imports_identity_idx ON trade_imports(identity_id, created_at DESC);

ALTER TABLE trade_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_imports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identity_isolation ON trade_imports;
CREATE POLICY identity_isolation ON trade_imports
  USING (identity_id = current_setting('app.identity_id', true)::uuid)
  WITH CHECK (identity_id = current_setting('app.identity_id', true)::uuid);
