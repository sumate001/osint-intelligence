"""Unit tests for signal intake — no DB, no network.

The contract tests validate against the JSON Schema files in contracts/, which
are shared byte-for-byte with the Horizon repo. If either side renames a field,
these fail rather than the integration silently going quiet in production.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.modules.signals.models import CALLBACK_STATUSES, STATUSES, VERDICTS
from app.modules.signals.schemas import (
    SignalClose,
    SignalDismiss,
    SignalInbound,
    VerdictCallback,
)
from app.modules.signals.service import _case_description
from app.modules.signals.tasks import BACKOFF_SECONDS, is_retryable

def _contracts_dir() -> Path:
    """Locate the shared contracts/ directory.

    Walking up from this file covers a checkout. Inside the api container it
    does not: the image is built from services/api, so contracts/ — which lives
    at the repo root — is outside the build context and cannot be COPYed in.
    Compose bind-mounts the repo at /repo, which is where it turns up there.

    Searching beats counting parent hops, which goes silently wrong the moment
    the module moves and fails as "missing contract" rather than "bad path".
    """
    roots = [*Path(__file__).resolve().parents]
    if env := os.getenv("CONTRACTS_DIR"):
        roots.insert(0, Path(env).parent)
    roots.append(Path("/repo"))

    for root in roots:
        candidate = root / "contracts" / "verdict.schema.json"
        if candidate.exists():
            return candidate.parent
    raise RuntimeError(
        "contracts/ not found — it is the shared source of truth with Horizon. "
        "Set CONTRACTS_DIR if it lives somewhere unusual."
    )


CONTRACTS = _contracts_dir()


def inbound_body(**overrides) -> dict:
    body = {
        "signal_id": "3f1a1c8e-4a2b-4f31-9c1e-8b0f2a6d7e55",
        "signal_type": "weak_signal",
        "title": "สัญญาณอ่อนด้านพลังงานในภาคตะวันออก",
        "combined_score": 0.72,
        "trend_score": 0.0,
        "categories": ["พลังงาน", "เศรษฐกิจ"],
        "summary": "พบรายงานไฟฟ้าดับซ้ำในนิคมอุตสาหกรรมหลายแห่ง",
        "top_events": [
            {
                "summary": "โรงไฟฟ้าหยุดเดินเครื่องฉุกเฉิน",
                "url": "https://example.com/a",
                "source_name": "Thai PBS",
                "credibility_weight": 0.9,
                "event_time": "2026-08-22T07:30:00+00:00",
            },
            {
                "summary": "นิคมรายงานไฟตกซ้ำ",
                "url": "https://example.com/b",
                "source_name": "ประชาไท",
                "credibility_weight": 0.75,
                "event_time": None,
            },
        ],
        "force_assessments": [
            {"force": "เศรษฐกิจและการเงิน", "impact": 0.79, "uncertainty": 0.5}
        ],
        "scenario_id": "bc150194-6cf0-4f90-94c5-deb1bd3f7c88",
        "created_at": "2026-08-22T08:00:00+00:00",
    }
    body.update(overrides)
    return body


def verdict_body(**overrides) -> dict:
    body = {
        "signal_id": "3f1a1c8e-4a2b-4f31-9c1e-8b0f2a6d7e55",
        "osint_signal_id": "9d149615-295e-44c7-9823-526b31bcb997",
        "verdict": "true_signal",
        "analyst_note": "ยืนยันจากแหล่งข่าวในพื้นที่",
        "closed_at": "2026-08-23T04:15:00+00:00",
    }
    body.update(overrides)
    return body


def _validator(filename: str) -> Draft202012Validator:
    schema = json.loads((CONTRACTS / filename).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(
        schema, format_checker=Draft202012Validator.FORMAT_CHECKER
    )


# ── contract: inbound ─────────────────────────────────────────────────────────


@pytest.mark.unit
def test_the_inbound_body_satisfies_both_the_schema_and_the_model():
    _validator("signal_inbound.schema.json").validate(inbound_body())
    SignalInbound(**inbound_body())


@pytest.mark.unit
def test_the_inbound_model_covers_every_field_the_schema_requires():
    schema = json.loads(
        (CONTRACTS / "signal_inbound.schema.json").read_text(encoding="utf-8")
    )
    assert set(SignalInbound.model_fields) == set(schema["properties"])


@pytest.mark.unit
def test_a_signal_with_no_scenario_is_accepted():
    """Horizon sends scenario_id=null when the cluster was too thin to reason about."""
    assert SignalInbound(**inbound_body(scenario_id=None)).scenario_id is None


@pytest.mark.unit
def test_an_event_without_a_known_time_is_accepted():
    parsed = SignalInbound(**inbound_body())
    assert parsed.top_events[1].event_time is None


@pytest.mark.unit
@pytest.mark.parametrize(
    "overrides",
    [
        {"signal_type": "rumour"},
        {"combined_score": 1.4},
        {"signal_id": "not-a-uuid"},
        {"unexpected_field": True},
    ],
)
def test_a_malformed_signal_is_rejected(overrides):
    with pytest.raises(ValidationError):
        SignalInbound(**inbound_body(**overrides))


@pytest.mark.unit
def test_more_than_ten_top_events_is_rejected():
    """The contract caps top_events at 10; accepting more would drift from it."""
    event = inbound_body()["top_events"][0]
    with pytest.raises(ValidationError):
        SignalInbound(**inbound_body(top_events=[event] * 11))


# ── contract: outbound verdict ────────────────────────────────────────────────


@pytest.mark.unit
def test_the_verdict_body_satisfies_both_the_schema_and_the_model():
    _validator("verdict.schema.json").validate(verdict_body())
    VerdictCallback(**verdict_body())


@pytest.mark.unit
def test_the_verdict_model_matches_the_schema_field_for_field():
    schema = json.loads((CONTRACTS / "verdict.schema.json").read_text(encoding="utf-8"))
    assert set(VerdictCallback.model_fields) == set(schema["required"])


@pytest.mark.unit
def test_a_verdict_without_a_note_is_valid():
    assert VerdictCallback(**verdict_body(analyst_note=None)).analyst_note is None


# ── enum agreement between model and schema ──────────────────────────────────


@pytest.mark.unit
def test_the_status_lifecycle_matches_the_spec():
    assert STATUSES == ("pending_review", "accepted", "dismissed", "closed")


@pytest.mark.unit
def test_the_verdict_values_match_horizon():
    schema = json.loads((CONTRACTS / "verdict.schema.json").read_text(encoding="utf-8"))
    assert set(VERDICTS) == set(schema["properties"]["verdict"]["enum"])


@pytest.mark.unit
def test_callback_statuses_include_the_unconfigured_case():
    """An unset HORIZON_BASE_URL is `disabled` — a choice, not a failure."""
    assert "disabled" in CALLBACK_STATUSES


# ── analyst actions ──────────────────────────────────────────────────────────


@pytest.mark.unit
def test_dismissing_without_a_reason_is_refused():
    """A dismissal with no stated reason teaches Horizon nothing."""
    with pytest.raises(ValidationError):
        SignalDismiss(reason="")


@pytest.mark.unit
def test_closing_requires_one_of_the_three_verdicts():
    assert SignalClose(verdict="inconclusive").verdict == "inconclusive"
    with pytest.raises(ValidationError):
        SignalClose(verdict="probably")


# ── case pre-fill ────────────────────────────────────────────────────────────


class _Signal:
    def __init__(self, payload, signal_type="weak_signal", title="หัวข้อ"):
        self.payload = payload
        self.signal_type = signal_type
        self.title = title


@pytest.mark.unit
def test_the_case_description_carries_the_summary_and_provenance():
    description = _case_description(_Signal(inbound_body()))
    assert "พบรายงานไฟฟ้าดับซ้ำ" in description
    assert "Horizon" in description
    assert "คะแนนรวม 0.72" in description


@pytest.mark.unit
def test_a_trend_breakout_description_shows_the_trend_score_not_the_combined():
    payload = inbound_body(signal_type="trend_breakout", trend_score=3.2)
    description = _case_description(_Signal(payload, signal_type="trend_breakout"))
    assert "trend score 3.20" in description
    assert "คะแนนรวม" not in description


@pytest.mark.unit
def test_the_description_lists_the_force_assessments():
    description = _case_description(_Signal(inbound_body()))
    assert "เศรษฐกิจและการเงิน" in description
    assert "impact 0.79" in description


@pytest.mark.unit
def test_a_signal_with_an_empty_payload_still_produces_a_description():
    """Defensive: a signal stored before a schema change must not break the inbox."""
    assert _case_description(_Signal({})) != ""


# ── callback retry policy ────────────────────────────────────────────────────


@pytest.mark.unit
def test_the_callback_backoff_matches_the_spec():
    assert BACKOFF_SECONDS == (30, 120, 600, 3600)


@pytest.mark.unit
@pytest.mark.parametrize("code", [500, 502, 503, 408, 425, 429])
def test_server_trouble_is_retried(code):
    assert is_retryable(code) is True


@pytest.mark.unit
@pytest.mark.parametrize("code", [400, 401, 404, 409, 422])
def test_a_rejected_verdict_is_not_retried(code):
    """Resending an unchanged body to a 4xx repeats the rejection."""
    assert is_retryable(code) is False
