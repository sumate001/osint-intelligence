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

from ..investigation import service as investigation
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

    # top_events become starting evidence, most credible first.
    for event in (signal.payload or {}).get("top_events", []):
        await investigation.add_evidence(
            db,
            case.id,
            EvidenceCreate(
                title=(event.get("summary") or "")[:500] or "(ไม่มีคำอธิบาย)",
                content=(
                    f"แหล่งข่าว: {event.get('source_name') or '-'}\n"
                    f"ความน่าเชื่อถือ: {event.get('credibility_weight', 0):.2f}\n"
                    f"เวลาเหตุการณ์: {event.get('event_time') or 'ไม่ระบุ'}"
                ),
                url=event.get("url") or None,
                status=SIGNAL_EVIDENCE_STATUS,
                source_type=SIGNAL_EVIDENCE_SOURCE,
            ),
        )

    if data.assigned_to:
        case.assigned_to = data.assigned_to

    signal.status = "accepted"
    signal.investigation_case_id = case.id
    await db.flush()

    log.info(
        "signal accepted into a case",
        extra={
            "osint_signal_id": str(signal.id),
            "case_id": str(case.id),
            "evidence": len((signal.payload or {}).get("top_events", [])),
        },
    )
    return case


async def dismiss(db: AsyncSession, signal: ExternalSignal, data: SignalDismiss) -> ExternalSignal:
    """Reject a signal outright. This is a false_signal as far as Horizon cares."""
    signal.status = "dismissed"
    signal.verdict = "false_signal"
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
