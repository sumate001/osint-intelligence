"""Signal intake business logic.

Reuses the Investigation module's service functions to create cases and evidence
rather than writing to its tables directly — this module adds a lane, it does
not reach into anyone else's.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import horizon_client as horizon
from ..investigation import service as investigation
from ..knowledge import service as knowledge
from ..investigation.schemas import CaseCreate, EvidenceCreate
from .models import ExternalSignal
from .schemas import SignalAccept, SignalClose, SignalDismiss, SignalInbound

log = logging.getLogger(__name__)

#: Evidence pulled straight from a signal is not analyst-verified yet.
SIGNAL_EVIDENCE_STATUS = "UNVERIFIED"
SIGNAL_EVIDENCE_SOURCE = "horizon_signal"


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_by_signal_id(db: AsyncSession, signal_id: uuid.UUID) -> ExternalSignal | None:
    return await db.scalar(select(ExternalSignal).where(ExternalSignal.signal_id == signal_id))


async def get(db: AsyncSession, external_id: uuid.UUID) -> ExternalSignal | None:
    return await db.get(ExternalSignal, external_id)


async def ingest(db: AsyncSession, data: SignalInbound) -> tuple[ExternalSignal, bool]:
    """Store an inbound signal. Returns (row, created).

    Idempotent on `signal_id`: Horizon retries on any non-202, so the same
    signal arriving twice must return the same answer rather than opening a
    second lead for the same story.
    """
    existing = await get_by_signal_id(db, data.signal_id)
    if existing is not None:
        log.info(
            "signal already received, returning the original id",
            extra={"signal_id": str(data.signal_id), "osint_signal_id": str(existing.id)},
        )
        return existing, False

    signal = ExternalSignal(
        source_system="horizon",
        signal_id=data.signal_id,
        signal_type=data.signal_type,
        title=data.title,
        payload=data.model_dump(mode="json"),
        status="pending_review",
        received_at=_now(),
    )
    db.add(signal)
    await db.flush()
    log.info(
        "signal received",
        extra={
            "signal_id": str(data.signal_id),
            "osint_signal_id": str(signal.id),
            "signal_type": data.signal_type,
        },
    )
    return signal, True


async def list_signals(
    db: AsyncSession, *, status: str | None = None, page: int = 1, page_size: int = 20
) -> tuple[list[ExternalSignal], int]:
    query = select(ExternalSignal)
    count_query = select(func.count()).select_from(ExternalSignal)
    if status:
        query = query.where(ExternalSignal.status == status)
        count_query = count_query.where(ExternalSignal.status == status)

    total = await db.scalar(count_query) or 0
    rows = (
        await db.execute(
            query.order_by(ExternalSignal.received_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars()
    return list(rows), total


async def pending_count(db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(ExternalSignal)
            .where(ExternalSignal.status == "pending_review")
        )
    ) or 0


def _case_description(signal: ExternalSignal) -> str:
    """Case description built from the signal, in Thai, for the analyst to edit."""
    payload = signal.payload or {}
    lines = [payload.get("summary") or signal.title or ""]

    score_label = (
        f"คะแนนรวม {payload.get('combined_score', 0):.2f}"
        if signal.signal_type == "weak_signal"
        else f"trend score {payload.get('trend_score', 0):.2f}"
    )
    lines += ["", f"ที่มา: Horizon ({signal.signal_type}) · {score_label}"]

    if payload.get("categories"):
        lines.append(f"หมวด: {' · '.join(payload['categories'])}")

    forces = payload.get("force_assessments") or []
    if forces:
        lines += ["", "แรงขับเคลื่อนที่ประเมินไว้:"]
        lines += [
            f"- {f['force']}: impact {f['impact']:.2f}, uncertainty {f['uncertainty']:.2f}"
            for f in forces
        ]
    return "\n".join(lines)


async def _evidence_seed(signal: ExternalSignal) -> tuple[list[dict], str]:
    """What the new case starts with, and where it came from.

    Prefers the cluster's full timeline pulled from Horizon at this moment: the
    cluster keeps growing after its signal fires, so by the time an analyst
    accepts — often a day later — the thread is materially longer than the
    snapshot the payload carried. Falls back to that snapshot when Horizon is
    unreachable, because a case with ten events beats no case at all.
    """
    payload = signal.payload or {}
    cluster_id = payload.get("cluster_id") or (
        signal.signal_type == "trend_breakout" and payload.get("signal_id")
    )

    if cluster_id:
        try:
            thread = await horizon.cluster_timeline(uuid.UUID(str(cluster_id)))
            events = thread.get("timeline") or []
            if events:
                return events, "timeline"
        except (horizon.HorizonUnavailable, ValueError) as exc:
            log.warning(
                "could not fetch the cluster timeline, falling back to top_events",
                extra={"osint_signal_id": str(signal.id), "error": str(exc)},
            )

    return payload.get("top_events", []), "top_events"


#: Horizon types entities more finely than the DESK store does. Anything
#: without a mapping keeps its own label rather than being forced into "other",
#: which would erase the distinction the resolver worked to establish.
_ENTITY_TYPE_MAP = {"person": "person", "org": "company", "place": "location"}


def _cluster_id_of(signal: ExternalSignal) -> str | None:
    payload = signal.payload or {}
    return payload.get("cluster_id") or (
        payload.get("signal_id") if signal.signal_type == "trend_breakout" else None
    )


async def _record_cast(db: AsyncSession, signal: ExternalSignal, case) -> int:
    """Record who the case is about, so the next case can find this one.

    Runs after the case exists and never raises: institutional memory is worth
    having, but not at the price of an analyst losing the case they just
    accepted because Horizon happened to be down.
    """
    cluster_id = _cluster_id_of(signal)
    if not cluster_id:
        return 0
    try:
        found = await horizon.cluster_entities(uuid.UUID(str(cluster_id)))
    except (horizon.HorizonUnavailable, ValueError) as exc:
        log.warning(
            "could not fetch the cast for this cluster",
            extra={"osint_signal_id": str(signal.id), "error": str(exc)},
        )
        return 0

    recorded = 0
    for entity in found.get("entities", []):
        name = (entity.get("canonical_name") or "").strip()
        if not name:
            continue
        await knowledge.upsert_entity(
            db,
            entity_name=name,
            entity_type=_ENTITY_TYPE_MAP.get(entity.get("entity_type"), "other"),
            case_id=str(case.id),
            case_title=case.title,
            role=f"ปรากฏใน {entity.get('events', 1)} เหตุการณ์",
            qid=entity.get("qid"),
            horizon_entity_id=entity.get("entity_id"),
        )
        recorded += 1
    return recorded


def _evidence_from(event: dict) -> EvidenceCreate:
    triage = event.get("triage") or {}
    lines = [
        f"แหล่งข่าว: {event.get('source_name') or '-'}",
        f"ความน่าเชื่อถือ: {event.get('credibility_weight', 0):.2f}",
        f"เวลาเหตุการณ์: {event.get('event_time') or 'ไม่ระบุ'}",
    ]
    if triage.get("verdict"):
        lines.append(f"triage: {triage['verdict']} ({triage.get('total')})")
    if event.get("source_count", 1) > 1:
        lines.append(f"ยืนยันจาก {event['source_count']} แหล่ง")

    return EvidenceCreate(
        title=(event.get("summary") or "")[:500] or "(ไม่มีคำอธิบาย)",
        content="\n".join(lines),
        url=event.get("url") or None,
        status=SIGNAL_EVIDENCE_STATUS,
        source_type=SIGNAL_EVIDENCE_SOURCE,
    )


async def accept(
    db: AsyncSession, signal: ExternalSignal, data: SignalAccept, user_id: str
):
    """Turn a signal into an investigation case, pre-filled and evidenced.

    Never automatic — an analyst decides. The signal keeps its own row so the
    verdict can travel back to Horizon when the case closes.
    """
    case = await investigation.create_case(
        db,
        CaseCreate(
            title=data.title or signal.title or "(สัญญาณจาก Horizon)",
            description=_case_description(signal),
            tags=["horizon", signal.signal_type, *(signal.payload or {}).get("categories", [])],
        ),
        user_id=user_id,
    )

    events, origin = await _evidence_seed(signal)
    for event in events:
        await investigation.add_evidence(db, case.id, _evidence_from(event))

    if data.assigned_to:
        case.assigned_to = data.assigned_to

    signal.status = "accepted"
    signal.investigation_case_id = case.id
    await db.flush()

    cast = await _record_cast(db, signal, case)

    log.info(
        "signal accepted into a case",
        extra={
            "osint_signal_id": str(signal.id),
            "case_id": str(case.id),
            "evidence": len(events),
            "evidence_source": origin,
            "entities_recorded": cast,
        },
    )
    return case


async def dismiss(db: AsyncSession, signal: ExternalSignal, data: SignalDismiss) -> ExternalSignal:
    """Reject a signal without opening a case, saying which kind of no it is.

    The default is `off_topic`, because that is what most dismissals are: the
    story is real and correctly detected, it is simply not something this
    newsroom follows. Reporting those as `false_signal` — which is what this did
    for every dismissal — feeds Horizon's threshold-tuning corpus with detection
    errors that never happened.
    """
    signal.status = "dismissed"
    signal.verdict = data.verdict
    signal.analyst_note = data.reason
    signal.closed_at = _now()
    signal.callback_status = "pending"
    await db.flush()
    log.info("signal dismissed", extra={"osint_signal_id": str(signal.id)})
    return signal


async def close(db: AsyncSession, signal: ExternalSignal, data: SignalClose) -> ExternalSignal:
    """Close a signal-originated case with the analyst's verdict.

    Lives here rather than in the Investigation module's case update so that
    closing an ordinary case is untouched by this integration.
    """
    signal.status = "closed"
    signal.verdict = data.verdict
    signal.analyst_note = data.analyst_note
    signal.closed_at = _now()
    signal.callback_status = "pending"

    if signal.investigation_case_id:
        case = await investigation.get_case(db, signal.investigation_case_id)
        if case is not None:
            case.status = "CLOSED"

    await db.flush()
    log.info(
        "signal closed",
        extra={"osint_signal_id": str(signal.id), "verdict": data.verdict},
    )
    return signal
