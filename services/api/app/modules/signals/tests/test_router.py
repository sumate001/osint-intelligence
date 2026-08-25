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


async def test_dismissing_reports_relevance_not_a_detection_error(db):
    """A dismissal is usually "not our beat", and that is not the radar's fault.

    This used to assert `false_signal` for every dismissal, which is what the
    code did — and what Horizon then fed into the corpus it tunes detection
    thresholds against. An editor clearing off-beat stories was training it to
    suppress detections that had been correct.
    """
    from app.modules.signals.schemas import SignalDismiss

    signal, _ = await service.ingest(db, SignalInbound(**body()))
    await service.dismiss(db, signal, SignalDismiss(reason="ไม่ใช่ประเด็นที่เราติดตาม"))
    await db.commit()

    assert signal.status == "dismissed"
    assert signal.verdict == "off_topic"
    assert signal.callback_status == "pending"
    assert signal.closed_at is not None


async def test_a_dismissal_can_still_say_the_detection_was_wrong(db):
    from app.modules.signals.schemas import SignalDismiss

    signal, _ = await service.ingest(db, SignalInbound(**body()))
    await service.dismiss(
        db, signal, SignalDismiss(reason="ข่าวปลอม", verdict="false_signal")
    )
    await db.commit()

    assert signal.verdict == "false_signal"


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


# ── cross-case memory ────────────────────────────────────────────────────────


async def test_accepting_records_who_the_case_is_about(db, monkeypatch):
    """Accepting a signal should populate the entity store, not just the case.

    Nothing wrote to that store before, so "have we investigated this person
    before" had one answer — no — regardless of the truth.
    """
    from app.modules.knowledge import service as knowledge
    from app.modules.signals import horizon_client, service as signals
    from app.modules.signals.schemas import SignalAccept

    cluster = "11111111-1111-1111-1111-111111111111"

    async def fake_entities(cluster_id, *, limit=50):
        assert str(cluster_id) == cluster
        return {
            "entities": [
                {
                    "entity_id": "h-1",
                    "canonical_name": "อนุทิน ชาญวีรกูล",
                    "entity_type": "person",
                    "qid": "Q16139757",
                    "events": 4,
                },
                {
                    "entity_id": "h-2",
                    "canonical_name": "กรมชลประทาน",
                    "entity_type": "org",
                    "qid": "Q13012478",
                    "events": 2,
                },
            ]
        }

    monkeypatch.setattr(horizon_client, "cluster_entities", fake_entities)
    monkeypatch.setattr(signals.horizon, "cluster_entities", fake_entities)

    payload = body()
    payload["cluster_id"] = cluster
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    case = await service.accept(db, signal, SignalAccept(), user_id="analyst-1")
    await db.commit()

    cast = await knowledge.case_cast(db, str(case.id))
    assert {member.entity_name for member in cast} == {"อนุทิน ชาญวีรกูล", "กรมชลประทาน"}
    assert {member.qid for member in cast} == {"Q16139757", "Q13012478"}


async def test_the_second_case_can_see_the_first(db, monkeypatch):
    """The whole point: an analyst opening case two learns about case one."""
    from app.modules.knowledge import service as knowledge
    from app.modules.signals import horizon_client, service as signals
    from app.modules.signals.schemas import SignalAccept

    async def fake_entities(cluster_id, *, limit=50):
        # Deliberately a different spelling the second time round — a name match
        # would see two strangers and report no prior cases.
        return {
            "entities": [
                {
                    "entity_id": "h-1",
                    "canonical_name": "Anutin Charnvirakul",
                    "entity_type": "person",
                    "qid": "Q16139757",
                    "events": 1,
                }
            ]
        }

    monkeypatch.setattr(horizon_client, "cluster_entities", fake_entities)
    monkeypatch.setattr(signals.horizon, "cluster_entities", fake_entities)

    await knowledge.upsert_entity(
        db,
        entity_name="อนุทิน ชาญวีรกูล",
        entity_type="person",
        case_id="earlier-case",
        case_title="คดีก่อนหน้า",
        qid="Q16139757",
    )

    payload = body()
    payload["cluster_id"] = "22222222-2222-2222-2222-222222222222"
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    case = await service.accept(db, signal, SignalAccept(), user_id="analyst-1")
    await db.commit()

    cast = await knowledge.case_cast(db, str(case.id))
    assert len(cast) == 1
    assert [ref.case_title for ref in cast[0].prior_cases] == ["คดีก่อนหน้า"]


async def test_a_case_still_opens_when_horizon_is_down(db, monkeypatch):
    """Memory is worth having, but not at the price of the case itself."""
    from app.modules.signals import horizon_client, service as signals
    from app.modules.signals.schemas import SignalAccept

    async def unavailable(cluster_id, *, limit=50):
        raise horizon_client.HorizonUnavailable("connection refused")

    monkeypatch.setattr(horizon_client, "cluster_entities", unavailable)
    monkeypatch.setattr(signals.horizon, "cluster_entities", unavailable)

    payload = body()
    payload["cluster_id"] = "33333333-3333-3333-3333-333333333333"
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    case = await service.accept(db, signal, SignalAccept(), user_id="analyst-1")
    await db.commit()

    assert signal.status == "accepted"
    assert signal.investigation_case_id == case.id


# ── profiles: what this newsroom is watching ─────────────────────────────────


async def test_a_signal_matching_no_profile_lands_in_its_own_box(db):
    """Unfiled is a destination, not a failure.

    It means the engine surfaced something nobody asked for, and that is worth
    seeing on its own — the alternative is a forced home, which is how an inbox
    stops being read.
    """
    from app.modules.signals.schemas import SignalProfileIn

    # Categories deliberately do not overlap, so this exercises the fall-through
    # without needing the model: no category match and no model answer both mean
    # "nobody asked for this", and that is the behaviour being pinned.
    await service.create_profile(
        db,
        SignalProfileIn(
            name="ความมั่นคงชายแดนใต้",
            description="เหตุรุนแรงในสามจังหวัด",
            categories=["ความมั่นคง"],
        ),
    )
    payload = body()
    payload["categories"] = ["บันเทิง/กีฬา"]
    payload["title"] = "ผลฟุตบอลนัดชิงชนะเลิศ"
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    await db.commit()

    assert signal.profile_id is None

    unsorted, total = await service.list_signals(db, profile=service.UNSORTED)
    assert signal.id in {s.id for s in unsorted}
    assert total >= 1


async def test_a_matching_category_is_not_enough_on_its_own(db):
    """The bug an editor spotted immediately: foreign news in a profile about
    the southern insurgency.

    A category overlap used to file the signal by itself. "ความมั่นคง" turned
    out to cover the insurgency, a cyber incident and a land-encroachment case
    equally well, so a durian orchard being cleared near a reservoir landed in a
    profile about insurgent violence. A profile's subject is always narrower than
    any category, so the description decides and the category only narrows the
    field.
    """
    from app.modules.signals.schemas import SignalProfileIn

    await service.create_profile(
        db,
        SignalProfileIn(
            name="พลังงาน", description="ไฟฟ้า น้ำมัน ก๊าซ", categories=["พลังงาน"]
        ),
    )
    # Matching is off in the suite, so reaching the model is the only way in —
    # which is exactly the point: a shared category alone must not file anything.
    signal, _ = await service.ingest(db, SignalInbound(**body()))
    await db.commit()

    assert signal.profile_id is None


async def test_a_category_does_not_exclude_a_profile_either(db, monkeypatch):
    """The correction to the correction.

    Filing on a category overlap was wrong, so overlap became a filter — which
    then dropped a clash between rangers and armed men in Narathiwat, because
    Horizon had labelled it ต่างประเทศ. That was the very signal that proved the
    label could not be trusted. A label too unreliable to include on is too
    unreliable to exclude on, so it gates nothing and every profile is considered.
    """
    from app.modules.signals import service as signals_service
    from app.modules.signals.schemas import SignalProfileIn

    await service.create_profile(
        db, SignalProfileIn(name="กีฬา", description="ฟุตบอล", categories=["บันเทิง/กีฬา"])
    )
    seen: dict = {}

    async def spy(messages, **kwargs):
        seen["prompt"] = "\n".join(m["content"] for m in messages)
        return {"profile": None, "reason": "ไม่ใช่"}

    monkeypatch.setattr(signals_service, "chat_json", spy)
    monkeypatch.setattr(
        signals_service.get_settings(), "signal_profile_matching", True, raising=False
    )

    payload = body()
    payload["categories"] = ["พลังงาน"]  # shares nothing with the profile
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    await db.commit()

    # The profile must reach the model even though no category overlaps.
    assert "กีฬา" in seen["prompt"]
    assert signal.profile_id is None


async def test_deleting_a_profile_does_not_delete_what_was_filed_under_it(db):
    """The FK is ON DELETE SET NULL for this reason: an editor retiring a beat
    must not silently destroy the leads collected under it."""
    from app.modules.signals.schemas import SignalProfileIn

    profile = await service.create_profile(
        db, SignalProfileIn(name="พลังงาน", description="ไฟฟ้า", categories=["พลังงาน"])
    )
    signal, _ = await service.ingest(db, SignalInbound(**body()))
    signal.profile_id = profile.id  # filed by hand: the model is off in the suite
    await db.commit()

    await service.delete_profile(db, profile)
    await db.commit()
    await db.refresh(signal)

    assert signal.profile_id is None
    assert await service.get(db, signal.id) is not None


async def test_a_timeline_is_built_from_the_signals_not_from_the_model(db):
    """The half of a brief that can be checked.

    The reading underneath a brief is the model's and is labelled as such; the
    timeline is assembled from the signals' own `top_events`, so an editor can
    hold it against the cards below. That is why they are separate fields.
    """
    from app.modules.signals.schemas import SignalProfileIn

    profile = await service.create_profile(
        db, SignalProfileIn(name="พลังงาน", description="ไฟฟ้า", categories=["พลังงาน"])
    )
    signal, _ = await service.ingest(db, SignalInbound(**body()))
    signal.profile_id = profile.id  # filed by hand: the model is off in the suite
    await db.commit()

    brief = await service.profile_brief(db, profile)

    assert brief["signals_total"] == 1
    assert [e["summary"] for e in brief["timeline"]] == ["โรงไฟฟ้าหยุดเดินเครื่องฉุกเฉิน"]
    assert brief["sources"] == ["Thai PBS"]


async def test_the_same_event_reaching_us_twice_appears_once(db):
    """A story that keeps growing arrives through several signals carrying
    overlapping `top_events`, and one happening on a timeline three times reads
    as three happenings."""
    from app.modules.signals.schemas import SignalProfileIn

    profile = await service.create_profile(
        db, SignalProfileIn(name="พลังงาน", description="ไฟฟ้า", categories=["พลังงาน"])
    )
    for _ in range(2):  # two signals carrying the same event
        signal, _ = await service.ingest(db, SignalInbound(**body()))
        signal.profile_id = profile.id
    await db.commit()

    brief = await service.profile_brief(db, profile)

    assert brief["signals_total"] == 2
    assert len(brief["timeline"]) == 1


async def test_an_undated_event_is_kept_at_the_end_rather_than_dropped(db):
    """"We do not know when" is not the same as "it did not happen"."""
    from app.modules.signals.schemas import SignalProfileIn

    profile = await service.create_profile(
        db, SignalProfileIn(name="พลังงาน", description="ไฟฟ้า", categories=["พลังงาน"])
    )
    payload = body()
    payload["top_events"] = [
        {
            "summary": "ไม่ทราบวันเวลา",
            "url": "https://example.com/undated",
            "source_name": "X",
            "credibility_weight": 0.5,
            "event_time": None,
        },
        payload["top_events"][0],
    ]
    signal, _ = await service.ingest(db, SignalInbound(**payload))
    signal.profile_id = profile.id
    await db.commit()

    brief = await service.profile_brief(db, profile)

    assert [e["summary"] for e in brief["timeline"]][-1] == "ไม่ทราบวันเวลา"
