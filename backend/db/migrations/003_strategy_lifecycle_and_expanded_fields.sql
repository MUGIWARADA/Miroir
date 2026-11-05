-- Migration 003: Strategy Lifecycle (Draft, Needs Review, Confirmed, Archived),
-- Expanded Strategy Specifications, Complete Version Snapshots, and Strategy-linked Conversations

-- 1. Update strategies status check constraint to include 'needs_review'
ALTER TABLE strategies DROP CONSTRAINT IF EXISTS strategies_status_check;
ALTER TABLE strategies ADD CONSTRAINT strategies_status_check 
  CHECK (status IN ('draft', 'needs_review', 'confirmed', 'archived'));

-- 2. Add expanded strategy specification fields to strategies
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS timeframes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS entry_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stop_loss_method JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exit_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS position_sizing_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS other_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Add complete snapshot column to strategy_versions
ALTER TABLE strategy_versions
  ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill snapshot for existing strategy_versions if empty
UPDATE strategy_versions
SET snapshot = jsonb_build_object(
  'name', name,
  'rules', rules,
  'trading_schedule', trading_schedule
)
WHERE snapshot = '{}'::jsonb;

-- 4. Add strategy_id and status to ai_conversations
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

CREATE INDEX IF NOT EXISTS ai_conversations_strategy_idx ON ai_conversations(strategy_id);
