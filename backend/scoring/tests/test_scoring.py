from __future__ import annotations

import copy

from fastapi.testclient import TestClient

from scoring.app.main import app

client = TestClient(app)
TOKEN = {"x-service-token": "dev-scoring-token"}


def base_request() -> dict:
    return {
        "request_id": "req-1",
        "scoring_version": "demo-v2",
        "strategy_version": {
            "id": "sv-1",
            "version_number": 1,
            "trading_schedule": {
                "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
                "start_time": "08:00",
                "end_time": "16:00",
                "timezone": "UTC",
            },
            "rules": [
                {
                    "id": "risk",
                    "dimension": "risk",
                    "label": "Risk limit",
                    "check": {"type": "max_risk_amount", "amount": 100},
                },
                {
                    "id": "size",
                    "dimension": "sizing",
                    "label": "Size limit",
                    "check": {"type": "max_notional", "amount": 10000},
                },
                {
                    "id": "plan",
                    "dimension": "plan",
                    "label": "Setup note",
                    "check": {"type": "required_evidence", "field": "setup_note"},
                },
                {
                    "id": "emotion",
                    "dimension": "emotion",
                    "label": "Calm state",
                    "check": {"type": "evidence_equals", "field": "emotional_state", "value": "calm"},
                },
            ],
        },
        "trade": {
            "id": "trade-1",
            "symbol": "TEST",
            "direction": "long",
            "quantity": 10,
            "entry_price": 100,
            "exit_price": 110,
            "fees": 1,
            "currency": "USD",
            "opened_at": "2026-10-05T09:00:00Z",
            "closed_at": "2026-10-05T10:00:00Z",
            "initial_risk_amount": 50,
            "realized_pnl": 99,
            "r_multiple": 1.98,
        },
        "evidence": [
            {"kind": "note", "payload": {"setup_note": "Valid breakout"}},
            {"kind": "state", "payload": {"emotional_state": "calm"}},
        ],
    }


def test_requires_service_token():
    response = client.post("/v1/score", json=base_request())
    assert response.status_code == 401


def test_full_adherence_scores_100():
    response = client.post("/v1/score", json=base_request(), headers=TOKEN)
    assert response.status_code == 200
    body = response.json()
    assert body["decision_quality_score"] == 100
    assert body["coverage_pct"] == 100
    assert len(body["dimensions"]) == 5
    assert all(d["score_pct"] == 100 for d in body["dimensions"])
    assert body["coaching"]["mode"] == "rule_based"


def test_missing_evidence_is_not_a_breach():
    request = base_request()
    request["evidence"] = []
    response = client.post("/v1/score", json=request, headers=TOKEN)
    assert response.status_code == 200
    body = response.json()
    # Risk, sizing, timing are assessable and followed = 65 weight.
    # Plan and emotion are missing = cannot_assess, not broken.
    assert body["decision_quality_score"] == 100
    assert body["coverage_pct"] == 65
    statuses = {d["dimension"]: d["status"] for d in body["dimensions"]}
    assert statuses["plan"] == "cannot_assess"
    assert statuses["emotion"] == "cannot_assess"
    scores = {d["dimension"]: d["score_pct"] for d in body["dimensions"]}
    assert scores["plan"] is None
    assert scores["emotion"] is None


def test_pnl_does_not_change_decision_quality():
    winning = base_request()
    losing = copy.deepcopy(winning)
    losing["trade"]["exit_price"] = 90
    losing["trade"]["realized_pnl"] = -101
    losing["trade"]["r_multiple"] = -2.02

    win_score = client.post("/v1/score", json=winning, headers=TOKEN).json()["decision_quality_score"]
    loss_score = client.post("/v1/score", json=losing, headers=TOKEN).json()["decision_quality_score"]
    assert win_score == loss_score == 100


def test_broken_risk_reduces_score():
    request = base_request()
    request["trade"]["initial_risk_amount"] = 150
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    # Earned 70 of 100 assessable weight.
    assert body["decision_quality_score"] == 70
    assert body["coverage_pct"] == 100


def test_no_assessable_rules_returns_null():
    request = base_request()
    request["strategy_version"]["rules"] = [
        {
            "id": "emotion",
            "dimension": "emotion",
            "label": "Calm state",
            "check": {"type": "evidence_equals", "field": "emotional_state", "value": "calm"},
        }
    ]
    request["evidence"] = []
    request["strategy_version"]["trading_schedule"] = None
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    assert body["decision_quality_score"] is None
    assert body["coverage_pct"] == 0
    assert len(body["dimensions"]) == 5
    assert body["dimensions"][-1]["status"] == "cannot_assess"
    assert body["dimensions"][-1]["score_pct"] is None


def test_unconfigured_dimension_is_returned_as_unassessable():
    request = base_request()
    request["strategy_version"]["rules"] = [
        rule for rule in request["strategy_version"]["rules"] if rule["dimension"] != "emotion"
    ]
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    emotion = next(d for d in body["dimensions"] if d["dimension"] == "emotion")
    assert emotion["status"] == "cannot_assess"
    assert emotion["score_pct"] is None
    assert body["decision_quality_score"] == 100
    assert body["coverage_pct"] == 90


def test_multiple_rules_in_dimension_are_averaged():
    request = base_request()
    request["strategy_version"]["rules"].append(
        {
            "id": "risk-limit-two",
            "dimension": "risk",
            "label": "Stricter risk limit",
            "check": {"type": "max_risk_amount", "amount": 40},
        }
    )
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    risk = next(d for d in body["dimensions"] if d["dimension"] == "risk")
    assert [rule["status"] for rule in risk["rules"]] == ["followed", "broken"]
    assert risk["status"] == "broken"
    assert risk["score_pct"] == 50
    assert risk["earned_weight"] == 15
    assert body["decision_quality_score"] == 85
    assert body["coverage_pct"] == 100


def test_cannot_assess_rule_does_not_receive_zero_points():
    request = base_request()
    request["strategy_version"]["rules"].append(
        {
            "id": "risk-note",
            "dimension": "risk",
            "label": "Risk note",
            "check": {"type": "required_evidence", "field": "risk_note"},
        }
    )
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    risk = next(d for d in body["dimensions"] if d["dimension"] == "risk")
    assert risk["score_pct"] == 100
    assert risk["assessable_weight"] == 15
    assert body["decision_quality_score"] == 100
    assert body["coverage_pct"] == 85


def test_missing_schedule_returns_unassessable_timing():
    request = base_request()
    request["strategy_version"]["trading_schedule"] = None
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "cannot_assess"
    assert timing["score_pct"] is None
    assert body["decision_quality_score"] == 100
    assert body["coverage_pct"] == 85


def test_missing_entry_timestamp_returns_unassessable_timing():
    request = base_request()
    request["trade"]["opened_at"] = None
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "cannot_assess"
    assert timing["score_pct"] is None
    assert body["coverage_pct"] == 85


def test_schedule_uses_the_strategys_timezone():
    request = base_request()
    request["strategy_version"]["trading_schedule"] = {
        "days": ["monday"],
        "start_time": "09:00",
        "end_time": "16:00",
        "timezone": "Africa/Lagos",
    }
    request["trade"]["opened_at"] = "2026-10-05T08:30:00Z"
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "followed"

    request["trade"]["opened_at"] = "2026-10-05T07:30:00Z"
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "broken"


def test_overnight_schedule_uses_the_start_day():
    request = base_request()
    request["strategy_version"]["trading_schedule"] = {
        "days": ["monday"],
        "start_time": "22:00",
        "end_time": "02:00",
        "timezone": "UTC",
    }
    request["trade"]["opened_at"] = "2026-10-06T01:00:00Z"
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "followed"


def test_legacy_timing_rule_remains_readable_for_old_versions():
    request = base_request()
    request["strategy_version"]["trading_schedule"] = None
    request["strategy_version"]["rules"].append(
        {
            "id": "legacy-window",
            "dimension": "timing",
            "label": "Legacy trading window",
            "check": {
                "type": "trading_window",
                "start": "08:00",
                "end": "16:00",
                "weekdays": [0, 1, 2, 3, 4],
                "timezone": "UTC",
            },
        }
    )
    response = client.post("/v1/score", json=request, headers=TOKEN)
    body = response.json()
    timing = next(d for d in body["dimensions"] if d["dimension"] == "timing")
    assert timing["status"] == "followed"


def test_unsupported_scoring_version_rejected():
    request = base_request()
    request["scoring_version"] = "unknown"
    response = client.post("/v1/score", json=request, headers=TOKEN)
    assert response.status_code == 400
