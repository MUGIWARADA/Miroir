"""Pydantic models for the deterministic scoring contract (demo-v2)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

Dimension = Literal["risk", "sizing", "plan", "timing", "emotion"]
RuleStatus = Literal["followed", "broken", "cannot_assess"]


Weekday = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


class TradingSchedule(BaseModel):
    days: list[Weekday] = Field(min_length=1, max_length=7)
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(min_length=1)

    @model_validator(mode="after")
    def times_must_differ(self) -> "TradingSchedule":
        if self.start_time == self.end_time:
            raise ValueError("start_time and end_time must be different")
        if len(set(self.days)) != len(self.days):
            raise ValueError("days must not contain duplicates")
        return self


class StrategyVersion(BaseModel):
    id: str
    version_number: int
    rules: list[dict[str, Any]]
    trading_schedule: Optional[TradingSchedule] = None


class Trade(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    symbol: Optional[str] = None
    direction: Optional[Literal["long", "short"]] = None
    quantity: Optional[float] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    fees: Optional[float] = None
    currency: Optional[str] = None
    opened_at: Optional[str] = None
    closed_at: Optional[str] = None
    initial_risk_amount: Optional[float] = None
    realized_pnl: Optional[float] = None
    r_multiple: Optional[float] = None


class Evidence(BaseModel):
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ScoreRequest(BaseModel):
    request_id: str
    scoring_version: str = "demo-v2"
    strategy_version: StrategyVersion
    trade: Trade
    evidence: list[Evidence] = Field(default_factory=list)


class RuleResult(BaseModel):
    rule_id: str
    dimension: Dimension
    label: str
    status: RuleStatus
    reason: str


class DimensionResult(BaseModel):
    dimension: Dimension
    status: RuleStatus
    score_pct: Optional[float]
    weight: float
    assessable_weight: float
    earned_weight: float
    rules: list[RuleResult]


class Coaching(BaseModel):
    mode: Literal["rule_based"] = "rule_based"
    summary: str
    actions: list[str]


class ScoreResponse(BaseModel):
    request_id: str
    scoring_version: str
    strategy_version_id: str
    trade_id: str
    decision_quality_score: Optional[float]
    coverage_pct: float
    dimensions: list[DimensionResult]
    coaching: Coaching
    warnings: list[str]
