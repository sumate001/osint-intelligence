"""Integration tests for the signal intake endpoints.

Requires a running database — the interesting behaviour here is idempotency and
the accept flow, and neither means anything against a mock.

    pytest app/modules/signals -m integration
"""
import uuid
from datetime import datetime, timezone

import pytest

# Collection must not explode outside the container: `pytest -m "not integration"`
# still imports every test module before filtering, and the whole app graph is
# only importable where the full dependency set is installed.
pytest.importorskip("fastapi", reason="integration tests run inside the api container")

# httpx client comes from conftest

from app.core.config import get_settings  # noqa: E402
from app.modules.signals import service  # noqa: E402
from app.modules.signals.schemas import SignalInbound  # noqa: E402

pytestmark = pytest.mark.integration

INBOUND = "/api/v1/signals/inbound"


def body(signal_id: str | None = None) -> dict:
    return {
        "signal_id": signal_id or str(uuid.uuid4()),
        "signal_type": "weak_signal",
        "title": "สัญญาณอ่อนด้านพลังงาน",
        "combined_score": 0.72,
        "trend_score": 0.0,
        "categories": ["พลังงาน"],
        "summary": "พบรายงานไฟฟ้าดับซ้ำในนิคมอุตสาหกรรม",
        "top_events": [
            {
                "summary": "โรงไฟฟ้าหยุดเดินเครื่องฉุกเฉิน",
                "url": "https://example.com/a",
                "source_name": "Thai PBS",
                "credibility_weight": 0.9,
                "event_time": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "force_assessments": [{"force": "เศรษฐกิจ", "impact": 0.8, "uncertainty": 0.5}],
        "cluster_id": None,
        "scenario_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


# `client` and `db` come from conftest.py. Do not redefine `client` here: a local
# one that skips the get_db override leaves the app on its own module-level
# engine, whose pooled connections then outlive the per-test event loop. The
# symptom is a suite where whichever DB-touching test runs second dies with
# "attached to a different loop", and rows leak into the real database.


@pytest.fixture
def key(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("HORIZON_INBOUND_API_KEY", "test-inbound-key")
    get_settings.cache_clear()
    yield "test-inbound-key"
    get_settings.cache_clear()


# ── auth ─────────────────────────────────────────────────────────────────────


async def test_a_missing_key_is_refused(client, key):
    response = await client.post(INBOUND, json=body())
    assert response.status_code == 401


async def test_a_wrong_key_is_refused(client, key):
    response = await client.post(INBOUND, json=body(), headers={"X-API-Key": "nope"})
    assert response.status_code == 401


async def test_an_unset_key_refuses_everything(client, monkeypatch):
    """An empty key must close the door — this endpoint faces outward."""
    get_settings.cache_clear()
    monkeypatch.setenv("HORIZON_INBOUND_API_KEY", "")
    get_settings.cache_clear()
    response = await client.post(INBOUND, json=body(), headers={"X-API-Key": ""})
    assert response.status_code == 401
    get_settings.cache_clear()


# ── inbound ──────────────────────────────────────────────────────────────────


async def test_a_valid_signal_is_accepted_with_an_id(client, key):
    response = await client.post(INBOUND, json=body(), headers={"X-API-Key": key})
    assert response.status_code == 202
    assert uuid.UUID(response.json()["osint_signal_id"])


async def test_a_malformed_signal_is_rejected_with_detail(client, key):
    payload = body()
    payload["signal_type"] = "rumour"
    response = await client.post(INBOUND, json=payload, headers={"X-API-Key": key})
    assert response.status_code == 422


async def test_the_same_signal_twice_yields_one_row_and_one_id(client, key):
    """Horizon retries anything that is not a 202, so re-delivery must not open
    a second lead for the same story."""
    payload = body()
    first = await client.post(INBOUND, json=payload, headers={"X-API-Key": key})
    second = await client.post(INBOUND, json=payload, headers={"X-API-Key": key})

    assert first.status_code == second.status_code == 202
    assert first.json()["osint_signal_id"] == second.json()["osint_signal_id"]


async def test_an_inbound_signal_never_opens_a_case_by_itself(client, key, db):
    """Signals arrive as draft leads. Only an analyst turns one into a case."""
    response = await client.post(INBOUND, json=body(), headers={"X-API-Key": key})
    signal = await service.get(db, uuid.UUID(response.json()["osint_signal_id"]))
    assert signal.status == "pending_review"
    assert signal.investigation_case_id is None


# ── accept / dismiss / close ─────────────────────────────────────────────────


async def test_accepting_creates_a_case_with_the_events_as_evidence(db):
    signal, _ = await service.ingest(db, SignalInbound(**body()))
    await db.commit()

    from app.modules.investigation import service as investigation
    from app.modules.signals.schemas import SignalAccept

    case = await service.accept(db, signal, SignalAccept(), user_id="analyst-1")
    await db.commit()

    evidence = await investigation.list_evidence(db, case.id)
    assert signal.status == "accepted"
    assert signal.investigation_case_id == case.id
    assert len(evidence) == 1
    assert evidence[0].source_type == "horizon_signal"
    assert "example.com" in (evidence[0].url or "")


async def test_dismissing_records_a_false_signal_ready_for_callback(db):
    from app.modules.signals.schemas import SignalDismiss

    signal, _ = await service.ingest(db, SignalInbound(**body()))
    await service.dismiss(db, signal, SignalDismiss(reason="ซ้ำกับที่ตรวจแล้ว"))
    await db.commit()

    assert signal.status == "dismissed"
    assert signal.verdict == "false_signal"
    assert signal.callback_status == "pending"
    assert signal.closed_at is not None


async def test_closing_marks_the_linked_case_closed_too(db):
    from app.modules.investigation import service as investigation
    from app.modules.signals.schemas import SignalAccept, SignalClose

    signal, _ = await service.ingest(db, SignalInbound(**body()))
    case = await service.accept(db, signal, SignalAccept(), user_id="analyst-1")
    await service.close(db, signal, SignalClose(verdict="true_signal", analyst_note="ยืนยัน"))
    await db.commit()

    reloaded = await investigation.get_case(db, case.id)
    assert signal.status == "closed"
    assert signal.verdict == "true_signal"
    assert signal.callback_status == "pending"
    assert reloaded.status == "CLOSED"
