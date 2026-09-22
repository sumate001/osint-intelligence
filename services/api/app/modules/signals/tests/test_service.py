"""Unit tests for signal intake — no DB, no network.

The contract tests validate against the JSON Schema files in contracts/, which
are shared byte-for-byte with the Horizon repo. If either side renames a field,
these fail rather than the integration silently going quiet in production.
"""
import json
import os
import sys
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
        # Present and null: this is a detection. Always emitting them means the
        # receiver never has to tell "absent" from "not set".
        "beat_id": None,
        "beat_name": None,
        "beat_reason": None,
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
        "cluster_id": "4b654b6a-921b-4fc3-91f2-8142b95bbbbf",
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


@pytest.mark.unit
def test_dismissing_defaults_to_relevance_not_accuracy():
    """The bug an editor would never have seen.

    Every dismissal used to be reported as `false_signal`. Most dismissals are
    not that — the story is real and correctly detected, it simply is not this
    newsroom's beat. Horizon's `verdicts` table is the corpus for tuning
    detection thresholds, so clearing off-beat stories was quietly teaching the
    radar to suppress the detections that were working.
    """
    assert SignalDismiss(reason="ไม่ใช่ประเด็นของเรา").verdict == "off_topic"


@pytest.mark.unit
def test_a_genuine_detection_error_can_still_be_reported():
    """Relevance and accuracy are both real answers; the point is telling them
    apart, not replacing one with the other."""
    assert SignalDismiss(reason="ข่าวปลอม", verdict="false_signal").verdict == "false_signal"


# ── Celery workers must not share a pooled connection across event loops ─────


def _engine_pool(monkeypatch, is_worker):
    from app.core import db

    monkeypatch.setattr(db, "IS_WORKER", is_worker)
    return db._make_engine().pool


def test_a_worker_gets_an_engine_that_pools_nothing(monkeypatch):
    """Each task runs asyncio.run(), so a pooled connection outlives the loop
    that opened it and reaches the next task already dead. It only fails when a
    task happens to reuse one, which is why it read as flakiness rather than as
    a bug: "Event loop is closed", intermittently, on a task that was fine a
    minute ago."""
    from sqlalchemy.pool import NullPool

    assert isinstance(_engine_pool(monkeypatch, True), NullPool)


def test_the_api_keeps_its_pool(monkeypatch):
    """One long-lived loop serves every request there, so pooling is correct and
    worth keeping — the fix must not cost the API a connection per query."""
    from sqlalchemy.pool import NullPool

    assert not isinstance(_engine_pool(monkeypatch, False), NullPool)


def test_the_worker_is_recognised_by_how_celery_starts_it():
    """compose runs `celery -A app.worker worker ...`, so argv[0] is the marker.
    If that command ever changes, this is the line that has to change with it."""
    from app.core import db

    assert db.IS_WORKER == ("celery" in sys.argv[0])


# ── beat_match: a request being served, not a detection ─────────────────────


def test_the_contract_allows_a_beat_match():
    """Both repos read this file; if either renames the type the other fails
    here rather than going quiet in production."""
    schema = json.loads(
        (CONTRACTS / "signal_inbound.schema.json").read_text(encoding="utf-8")
    )

    assert "beat_match" in schema["properties"]["signal_type"]["enum"]
    for field in ("beat_id", "beat_name", "beat_reason"):
        assert field in schema["properties"]
        assert field in schema["required"]


def test_the_inbound_model_accepts_a_beat_match():
    from app.modules.signals.schemas import SignalInbound

    signal = SignalInbound(
        signal_id=uuid.uuid4(),
        signal_type="beat_match",
        title="อิสราเอลขยายพื้นที่ตั้งถิ่นฐานเขต E1",
        combined_score=0.0,
        trend_score=0.0,
        categories=["ต่างประเทศ"],
        summary="มีการรายงานการขยายพื้นที่ในเขต E1",
        top_events=[],
        force_assessments=[],
        cluster_id=None,
        scenario_id=None,
        beat_id=uuid.uuid4(),
        beat_name="อิสราเอลในประเทศไทย",
        beat_reason="เป็นความเคลื่อนไหวที่ประเด็นนี้ติดตามอยู่",
        created_at=datetime.now(timezone.utc),
    )

    assert signal.signal_type == "beat_match"
    assert signal.beat_id is not None


def test_a_detection_still_validates_without_beat_fields():
    """The three fields are nullable, so nothing about existing detections
    changes — a Horizon that has not deployed yet keeps working."""
    from app.modules.signals.schemas import SignalInbound

    signal = SignalInbound(
        signal_id=uuid.uuid4(),
        signal_type="weak_signal",
        title="สัญญาณอ่อน",
        combined_score=0.3,
        trend_score=0.0,
        created_at=datetime.now(timezone.utc),
    )

    assert signal.beat_id is None
    assert signal.beat_name is None


def test_a_beat_match_skips_the_model_and_a_detection_does_not():
    """Horizon has already decided which beat this is on. Re-deciding here
    would spend a model call to possibly contradict the reason shown to the
    editor right beside it."""
    import inspect

    from app.modules.signals import router

    source = inspect.getsource(router.receive_signal)

    assert "signal.profile_id is None" in source
    assert "file_into_profile.delay" in source


# ── the beat brief: a reading of the story, not a reading list ──────────────


def test_a_step_with_no_citation_is_dropped():
    """Every step has to point at reports the editor can open. One citing
    nothing is the model narrating rather than reading — and on a beat page
    that is indistinguishable from reporting."""
    from app.modules.signals.service import _situation_from

    kept = _situation_from(
        [
            {"when": "ต้นเดือน ก.ย.", "change": "สถานการณ์ตึงขึ้น", "refs": [1]},
            {"when": "กลางเดือน", "change": "ไม่มีอะไรรองรับ", "refs": []},
        ],
        timeline_length=3,
    )

    assert [s["change"] for s in kept] == ["สถานการณ์ตึงขึ้น"]


def test_a_citation_outside_the_timeline_is_dropped_not_clamped():
    """Guessing which report was meant is how a sentence ends up attached to a
    story it is not about."""
    from app.modules.signals.service import _situation_from

    assert _situation_from([{"when": "x", "change": "y", "refs": [99]}], timeline_length=3) == []


def test_citations_are_returned_as_timeline_positions():
    """The model counts from 1 because that is what it was shown; the UI indexes
    from 0. Getting this wrong points every step at its neighbour."""
    from app.modules.signals.service import _situation_from

    kept = _situation_from([{"when": "x", "change": "y", "refs": [1, 3]}], timeline_length=3)

    assert kept[0]["refs"] == [0, 2]


def test_a_malformed_answer_costs_the_reading_not_the_page():
    """The timeline is worth showing on its own — it always was."""
    from app.modules.signals.service import _situation_from

    assert _situation_from(None, 3) == []
    assert _situation_from("ไม่ใช่รายการ", 3) == []
    assert _situation_from([{"change": "ไม่มี refs"}], 3) == []


def test_the_prompt_asks_for_a_summary_rather_than_the_headlines_back():
    """The reports are already on the page below it. Restating them is the
    failure this replaced."""
    from app.modules.signals.service import BRIEF_SYSTEM

    assert "ไม่ใช่การแปะข่าวเรียงตามวันที่" in BRIEF_SYSTEM
    assert "ห้ามคัดลอกหัวข้อข่าวมาเป็นคำตอบ" in BRIEF_SYSTEM


def test_the_signals_module_has_a_timeout_that_matches_the_hardware():
    """It fell through to the 120s default while a warm answer on this host
    takes 64–120s and a cold one took 222 — so the brief came back empty with a
    200, which reads as "nothing to say" rather than "never answered"."""
    from app.core.llm import TIMEOUT_BY_MODULE

    assert TIMEOUT_BY_MODULE["signals"] >= 240.0
    assert TIMEOUT_BY_MODULE["default"] >= 240.0


def test_the_suite_does_not_put_a_live_model_on_the_ingest_path():
    """conftest used setdefault, and the api container — where this suite is
    normally run — already sets it true. The line did nothing, and every ingest
    test called the model."""
    import os

    assert os.environ["SIGNAL_PROFILE_MATCHING"] == "false"
