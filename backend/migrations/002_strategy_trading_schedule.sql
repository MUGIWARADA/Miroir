-- Keep each confirmed strategy version's trading-hours schedule immutable.
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS draft_trading_schedule JSONB;

ALTER TABLE strategy_versions
  ADD COLUMN IF NOT EXISTS trading_schedule JSONB;

-- Older strategy versions may store a trading_window rule instead of a schedule.
-- The scoring service retains a read-only compatibility path for those versions.
