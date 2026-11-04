"""Deterministic, model-free scoring for Miroir demo-v2.

Principles:
- Profit/loss never changes Decision Quality.
- Missing evidence is never a breach; it is `cannot_assess`.
- Score = 100 * earned assessable weight / total assessable weight.
- Coverage = assessable weight / total configured weight.
- Emotion requires explicit evidence.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from zoneinfo import ZoneInfo

from .models import (
    Coaching,
    DimensionResult,
    Evidence,
    RuleResult,
    ScoreRequest,
    TradingSchedule,
    ScoreResponse,
    Trade,
)

SCORING_VERSION = "demo-v2"

DIMENSION_WEIGHTS: dict[str, float] = {
    "risk": 30.0,
    "sizing": 20.0,
    "plan": 25.0,
    "timing": 15.0,
    "emotion": 10.0,
}


def _dec(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _evidence_value(evidence: list[Evidence], field: str) -> Any:
    for item in evidence:
        if field in item.payload and item.payload[field] is not None:
            return item.payload[field]
    return None


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _check_trading_schedule(
    schedule: TradingSchedule, opened_at: Optional[str]
) -> tuple[str, str]:
    opened = _parse_dt(opened_at)
    if opened is None or opened.tzinfo is None:
        return "cannot_assess", "Entry timestamp is missing or has no timezone."

    try:
        local = opened.astimezone(ZoneInfo(schedule.timezone))
    except Exception:
        return "cannot_assess", f"Unknown timezone '{schedule.timezone}'."

    day_numbers = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    allowed_days = {day_numbers[day] for day in schedule.days}
    minutes = local.hour * 60 + local.minute
    start_hour, start_minute = map(int, schedule.start_time.split(":"))
    end_hour, end_minute = map(int, schedule.end_time.split(":"))
    start = start_hour * 60 + start_minute
    end = end_hour * 60 + end_minute

    if start < end:
        in_window = local.weekday() in allowed_days and start <= minutes < end
    elif minutes >= start:
        in_window = local.weekday() in allowed_days
    elif minutes < end:
        previous_day = (local.weekday() - 1) % 7
        in_window = previous_day in allowed_days
    else:
        in_window = False

    if in_window:
        return "followed", "Trade was opened inside the strategy's allowed trading schedule."
    return "broken", "Trade was opened outside the strategy's allowed trading schedule."


def _check_rule(rule: dict[str, Any], trade: Trade, evidence: list[Evidence]) -> tuple[str, str]:
    check = rule.get("check", {})
    kind = check.get("type")

    if kind == "max_risk_amount":
        risk = _dec(trade.initial_risk_amount)
        limit = _dec(check.get("amount"))
        if risk is None or limit is None:
            return "cannot_assess", "Initial risk amount is not recorded, so risk cannot be assessed."
        if risk <= limit:
            return "followed", f"Initial risk {risk} is within the {limit} limit."
        return "broken", f"Initial risk {risk} exceeds the {limit} limit."

    if kind == "max_notional":
        qty = _dec(trade.quantity)
        entry = _dec(trade.entry_price)
        limit = _dec(check.get("amount"))
        if qty is None or entry is None or limit is None:
            return "cannot_assess", "Quantity/entry price missing, so position size cannot be assessed."
        notional = qty * entry
        if notional <= limit:
            return "followed", f"Position notional {notional} is within the {limit} limit."
        return "broken", f"Position notional {notional} exceeds the {limit} limit."

    if kind == "required_evidence":
        field = check.get("field", "")
        value = _evidence_value(evidence, field)
        if value is None:
            return "cannot_assess", f"Evidence field '{field}' is missing; not counted as a breach."
        return "followed", f"Evidence field '{field}' is present."

    if kind == "evidence_equals":
        field = check.get("field", "")
        expected = check.get("value")
        value = _evidence_value(evidence, field)
        if value is None:
            return "cannot_assess", f"Evidence field '{field}' is missing; not counted as a breach."
        if value == expected:
            return "followed", f"Evidence '{field}' matches the expected value."
        return "broken", f"Evidence '{field}' is '{value}', expected '{expected}'."

    if kind == "trading_window":
        opened = _parse_dt(trade.opened_at)
        if opened is None:
            return "cannot_assess", "Open time missing, so timing cannot be assessed."
        tz_name = check.get("timezone") or "UTC"
        try:
            local = opened.astimezone(ZoneInfo(tz_name))
        except Exception:
            return "cannot_assess", f"Unknown timezone '{tz_name}'."
        weekdays = check.get("weekdays")
        if weekdays is not None and local.weekday() not in weekdays:
            return "broken", "Trade was opened outside the allowed weekdays."
        start = check.get("start", "00:00")
        end = check.get("end", "23:59")
        minutes = local.hour * 60 + local.minute
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
        start_m, end_m = sh * 60 + sm, eh * 60 + em
        if start_m <= end_m:
            in_window = start_m <= minutes < end_m
        else:  # overnight window
            in_window = minutes >= start_m or minutes < end_m
        if in_window:
            return "followed", "Trade was opened inside the allowed trading window."
        return "broken", "Trade was opened outside the allowed trading window."

    return "cannot_assess", f"Unsupported check type '{kind}'."


def score(request: ScoreRequest) -> ScoreResponse:
    trade = request.trade
    evidence = request.evidence
    warnings: list[str] = []

    # Group rules by dimension, preserving order.
    by_dimension: dict[str, list[dict[str, Any]]] = {}
    for rule in request.strategy_version.rules:
        dimension = rule.get("dimension")
        if dimension not in DIMENSION_WEIGHTS:
            warnings.append(f"Rule '{rule.get('id')}' has unknown dimension '{dimension}' and was skipped.")
            continue
        by_dimension.setdefault(dimension, []).append(rule)

    dimensions: list[DimensionResult] = []
    total_framework_weight = sum(DIMENSION_WEIGHTS.values())
    assessable_weight = 0.0
    earned_weight = 0.0

    # The five category weights always make up the full 100-point framework.
    # Each configured rule shares its category's weight equally. A rule that
    # cannot be assessed contributes neither points nor assessable weight.
    for dimension, weight in DIMENSION_WEIGHTS.items():
        rules = by_dimension.get(dimension, [])
        rule_results: list[RuleResult] = []
        if dimension == "timing" and request.strategy_version.trading_schedule is not None:
            status, reason = _check_trading_schedule(
                request.strategy_version.trading_schedule, trade.opened_at
            )
            rule_results.append(
                RuleResult(
                    rule_id="trading-schedule",
                    dimension="timing",
                    label="Allowed trading hours",
                    status=status,  # type: ignore[arg-type]
                    reason=reason,
                )
            )
            if rules:
                warnings.append("Legacy timing rules were ignored because a strategy schedule is set.")
        else:
            for rule in rules:
                status, reason = _check_rule(rule, trade, evidence)
                rule_results.append(
                    RuleResult(
                        rule_id=str(rule.get("id", "unknown")),
                        dimension=dimension,  # type: ignore[arg-type]
                        label=str(rule.get("label", "")),
                        status=status,  # type: ignore[arg-type]
                        reason=reason,
                    )
                )

        assessable_rules = [r for r in rule_results if r.status != "cannot_assess"]
        if not assessable_rules:
            dim_status = "cannot_assess"
            dim_score = None
            dim_assessable = 0.0
            dim_earned = 0.0
        else:
            rule_weight = weight / len(rule_results)
            followed_count = sum(r.status == "followed" for r in assessable_rules)
            dim_assessable = rule_weight * len(assessable_rules)
            dim_earned = rule_weight * followed_count
            dim_score = round(100.0 * followed_count / len(assessable_rules), 2)
            dim_status = "broken" if any(r.status == "broken" for r in assessable_rules) else "followed"

        assessable_weight += dim_assessable
        earned_weight += dim_earned
        dimensions.append(
            DimensionResult(
                dimension=dimension,  # type: ignore[arg-type]
                status=dim_status,  # type: ignore[arg-type]
                score_pct=dim_score,
                weight=weight,
                assessable_weight=round(dim_assessable, 4),
                earned_weight=round(dim_earned, 4),
                rules=rule_results,
            )
        )

    if assessable_weight > 0:
        dq = round(100.0 * earned_weight / assessable_weight, 2)
    else:
        dq = None
        warnings.append("No assessable rules; Decision Quality is null.")

    coverage = round(100.0 * assessable_weight / total_framework_weight, 2)
    if coverage < 100.0:
        warnings.append(
            f"Coverage is {coverage}%. Missing evidence or rules were not treated as breaches."
        )

    coaching = _coach(dimensions, dq, coverage)

    return ScoreResponse(
        request_id=request.request_id,
        scoring_version=SCORING_VERSION,
        strategy_version_id=request.strategy_version.id,
        trade_id=trade.id,
        decision_quality_score=dq,
        coverage_pct=coverage,
        dimensions=dimensions,
        coaching=coaching,
        warnings=warnings,
    )


def _coach(dimensions: list[DimensionResult], dq: Optional[float], coverage: float) -> Coaching:
    broken = [r for d in dimensions for r in d.rules if r.status == "broken"]
    missing = [r for d in dimensions for r in d.rules if r.status == "cannot_assess"]

    if dq is None:
        summary = "Not enough evidence to score this trade yet. Add the missing evidence and review again."
    elif not broken:
        summary = f"Decision Quality {dq}/100. You followed every rule that could be assessed."
    else:
        summary = f"Decision Quality {dq}/100. {len(broken)} rule(s) were broken on this trade."

    actions: list[str] = []
    for rule in broken[:3]:
        actions.append(f"Fix '{rule.label}': {rule.reason}")
    if missing:
        fields = ", ".join(sorted({r.label or r.rule_id for r in missing})[:3])
        actions.append(f"Add evidence so these can be assessed next time: {fields}.")
    if coverage < 100.0:
        actions.append("Add evidence for rules that could not be assessed to raise coverage.")
    if not actions:
        actions.append("Keep applying the same rules and log evidence on every trade.")

    return Coaching(summary=summary, actions=actions)
