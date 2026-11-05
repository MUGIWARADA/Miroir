-- Migration 002: AI Companion, Strategy Lifecycle, and Immutable Versioning

-- 1. Extend strategies table with status, description, updated_at
ALTER TABLE strategies 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'archived')),
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Create Immutable Strategy Versions table
CREATE TABLE IF NOT EXISTS strategy_versions (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL,
  identity_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  rules JSONB NOT NULL,
  trading_schedule JSONB NOT NULL,
  change_summary TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (identity_id, strategy_id) REFERENCES strategies(identity_id, id) ON DELETE CASCADE,
  UNIQUE(strategy_id, version_number)
);
CREATE INDEX IF NOT EXISTS strategy_versions_identity_idx ON strategy_versions(identity_id, strategy_id);

-- 3. Backfill initial strategy version for existing strategies
INSERT INTO strategy_versions (id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, confirmed_at)
SELECT current_version_id, id, identity_id, 1, name, rules, trading_schedule, 'Initial confirmed version', created_at
FROM strategies
ON CONFLICT (id) DO NOTHING;

-- 4. Foreign Key enforcement for trade strategy versions
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trades_strategy_version'
  ) THEN
    ALTER TABLE trades 
      ADD CONSTRAINT fk_trades_strategy_version 
      FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5. Persistent AI Conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Discipline Coaching',
  context_type TEXT NOT NULL DEFAULT 'general' CHECK (context_type IN ('general', 'trade_review', 'strategy_refinement', 'weekly_coaching')),
  context_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_identity_idx ON ai_conversations(identity_id, updated_at DESC);

-- 6. Persistent AI Messages
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_convo_idx ON ai_messages(conversation_id, created_at ASC);

-- 7. Dedicated AI Explanations Table
CREATE TABLE IF NOT EXISTS trade_ai_explanations (
  id UUID PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  summary TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  behavioral_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id)
);
CREATE INDEX IF NOT EXISTS trade_ai_explanations_identity_idx ON trade_ai_explanations(identity_id, created_at DESC);
