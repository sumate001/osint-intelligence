"""External signal intake — HTTP only, all logic in service.py.

Two audiences on one router:
  - `/inbound` is machine-facing, authenticated by a shared key from Horizon
  - everything else is analyst-facing, authenticated by the normal user session
"""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ...core.auth import get_current_user
from ...core.config import get_settings
from ...core.db import get_db
from ..investigation.schemas import CaseOut
from . import horizon_client as horizon
from . import service
from .schemas import (
    SignalAccept,
    SignalClose,
    SignalCountOut,
    SignalDismiss,
    SignalInbound,
    SignalInboundAck,
    SignalListOut,
    SignalOut,
    ProfileBrief,
    SignalProfileIn,
    SignalProfileOut,
)
from .tasks import file_into_profile, send_verdict

log = logging.getLogger(__name__)

router = APIRouter()


async def require_horizon_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    """Guards the inbound endpoint.

    An unset key refuses everything rather than opening the door: this endpoint
    is reachable from outside, unlike the analyst-facing ones.
    """
    expected = get_settings().horizon_inbound_api_key
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid API key")


# ── Inbound: Horizon → OSINT//DESK ───────────────────────────────────────────


@router.post(
    "/inbound",
    response_model=SignalInboundAck,
    status_code=202,
    dependencies=[Depends(require_horizon_key)],
)
async def receive_signal(data: SignalInbound, db=Depends(get_db)):
    """Accept a signal as a draft lead. Never opens a case on its own.

    Idempotent: Horizon retries anything that is not a 202, so a repeat returns
    the id we already assigned instead of creating a duplicate lead.
    """
    signal, created = await service.ingest(db, data)
    await db.commit()
    if created and signal.profile_id is None:
        # Queued, not awaited: filing needs the model, and Horizon is holding
        # this request open. A slow answer here becomes a delivery timeout and a
        # retry on their side.
        #
        # Skipped entirely for a beat_match, which arrives already filed against
        # the beat the newsroom defined. Asking our model to re-judge it would
        # spend a call to maybe contradict the reason shown to the editor.
        file_into_profile.delay(str(signal.id))
    return SignalInboundAck(osint_signal_id=str(signal.id))


# ── The inbound stream, read from Horizon ────────────────────────────────────


@router.get("/feed")
async def feed(
    verdict: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    order: str = Query("recent", pattern="^(recent|score)$"),
    _: dict = Depends(get_current_user),
):
    """The scored inbound stream.

    Horizon does the ingesting and the scoring now; this is a read-through so
    the browser talks to one origin. Unreachable Horizon returns an empty feed
    with `available: false` rather than an error — a monitoring problem should
    not look like a broken page.
    """
    try:
        return {
            "available": True,
            "items": await horizon.list_events(
                limit=limit, offset=offset, verdict=verdict, order=order
            ),
        }
    except horizon.HorizonUnavailable as exc:
        log.warning("feed unavailable", extra={"error": str(exc)})
        return {"available": False, "items": [], "error": str(exc)}


@router.get("/feed/counts")
async def feed_counts(_: dict = Depends(get_current_user)):
    try:
        return {"available": True, "counts": await horizon.event_counts()}
    except horizon.HorizonUnavailable as exc:
        return {"available": False, "counts": {}, "error": str(exc)}


# ── Analyst-facing ───────────────────────────────────────────────────────────


@router.get("", response_model=SignalListOut)
async def list_signals(
    status: str | None = Query(None),
    profile: str | None = Query(
        None,
        description=(
            'profile id; "unsorted" for signals that matched no beat; '
            '"filed" for everything that matched one, without naming it'
        ),
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    items, total = await service.list_signals(
        db, status=status, profile=profile, page=page, page_size=page_size
    )
    return SignalListOut(items=items, total=total)


# ── profiles: what this newsroom is watching ─────────────────────────────────


@router.get("/profiles", response_model=list[SignalProfileOut])
async def list_profiles(db=Depends(get_db), _: dict = Depends(get_current_user)):
    return [
        SignalProfileOut(**SignalProfileIn.model_validate(p, from_attributes=True).model_dump(),
                         id=p.id, pending=pending)
        for p, pending in await service.list_profiles(db)
    ]


@router.get("/profiles/active", dependencies=[Depends(require_horizon_key)])
async def active_profiles_for_horizon(db=Depends(get_db)):
    """The beats Horizon should be watching for, read with the inbound key.

    This is the half of the integration that was missing. A beat used to be a
    filter applied to whatever the detectors happened to send, so a newsroom
    could define "อิสราเอลในประเทศไทย", and 90 matching events could sit in
    Horizon, and not one would travel — nothing asked for them. Horizon only
    dispatches what it finds anomalous, which is 2.5% of what it knows.

    Deliberately a pull, not a push. If OSINT//DESK is down Horizon keeps its
    last answer and carries on; nothing here has to retry, and no new outbound
    dependency is added to the side that holds the editorial data.
    """
    return [
        {
            "id": str(p.id),
            "name": p.name,
            # The free text is what the model actually reads, on both sides.
            "description": p.description,
            "categories": p.categories or [],
        }
        for p, _ in await service.list_profiles(db)
        if p.active
    ]


@router.post("/profiles", response_model=SignalProfileOut, status_code=201)
async def create_profile(
    data: SignalProfileIn, db=Depends(get_db), _: dict = Depends(get_current_user)
):
    profile = await service.create_profile(db, data)
    await db.commit()
    return SignalProfileOut(**data.model_dump(), id=profile.id, pending=0)


@router.patch("/profiles/{profile_id}", response_model=SignalProfileOut)
async def update_profile(
    profile_id: uuid.UUID,
    data: SignalProfileIn,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    profile = await service.get_profile(db, profile_id)
    if profile is None:
        raise HTTPException(404, "ไม่พบโปรไฟล์นี้")
    await service.update_profile(db, profile, data)
    await db.commit()
    return SignalProfileOut(**data.model_dump(), id=profile.id, pending=0)


@router.get("/profiles/{profile_id}/brief", response_model=ProfileBrief)
async def profile_brief(
    profile_id: uuid.UUID, db=Depends(get_db), _: dict = Depends(get_current_user)
):
    """What has been happening on this beat.

    A filtered list answers "what arrived". Someone following a running story
    needs "what happened, where, and what moved" — and the timeline half of that
    is assembled from the signals themselves, so it can be checked against them.
    """
    profile = await service.get_profile(db, profile_id)
    if profile is None:
        raise HTTPException(404, "ไม่พบโปรไฟล์นี้")
    brief = await service.profile_brief(db, profile)
    return ProfileBrief(
        **{**brief, "profile": SignalProfileOut(
            **SignalProfileIn.model_validate(profile, from_attributes=True).model_dump(),
            id=profile.id,
            pending=0,
        )}
    )


@router.delete("/profiles/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: uuid.UUID, db=Depends(get_db), _: dict = Depends(get_current_user)
):
    """Signals filed under it move to the unsorted box; nothing is deleted with it."""
    profile = await service.get_profile(db, profile_id)
    if profile is None:
        raise HTTPException(404, "ไม่พบโปรไฟล์นี้")
    await service.delete_profile(db, profile)
    await db.commit()


@router.get("/count", response_model=SignalCountOut)
async def count_signals(db=Depends(get_db), _: dict = Depends(get_current_user)):
    """Badge counter for the inbox — the notification the spec asks for."""
    return SignalCountOut(pending_review=await service.pending_count(db))


@router.get("/{external_id}", response_model=SignalOut)
async def get_signal(
    external_id: uuid.UUID, db=Depends(get_db), _: dict = Depends(get_current_user)
):
    signal = await service.get(db, external_id)
    if signal is None:
        raise HTTPException(status_code=404, detail="signal not found")
    return signal


@router.post("/{external_id}/accept", response_model=CaseOut, status_code=201)
async def accept_signal(
    external_id: uuid.UUID,
    data: SignalAccept,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create an investigation case from the signal, pre-filled with its events."""
    signal = await service.get(db, external_id)
    if signal is None:
        raise HTTPException(status_code=404, detail="signal not found")
    if signal.status != "pending_review":
        raise HTTPException(status_code=409, detail=f"signal already {signal.status}")
    return await service.accept(db, signal, data, user_id=current_user["id"])


@router.post("/{external_id}/dismiss", response_model=SignalOut)
async def dismiss_signal(
    external_id: uuid.UUID,
    data: SignalDismiss,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Reject the signal and tell Horizon immediately that it was a false lead."""
    signal = await service.get(db, external_id)
    if signal is None:
        raise HTTPException(status_code=404, detail="signal not found")
    if signal.status != "pending_review":
        raise HTTPException(status_code=409, detail=f"signal already {signal.status}")

    dismissed = await service.dismiss(db, signal, data)
    await db.commit()
    send_verdict.delay(str(dismissed.id))
    return dismissed


@router.post("/{external_id}/close", response_model=SignalOut)
async def close_signal(
    external_id: uuid.UUID,
    data: SignalClose,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Close a signal-originated case with a verdict, and send it back.

    Separate from the Investigation module's case update on purpose: closing an
    ordinary case must stay exactly as it was before this integration existed.
    """
    signal = await service.get(db, external_id)
    if signal is None:
        raise HTTPException(status_code=404, detail="signal not found")
    if signal.status == "closed":
        raise HTTPException(status_code=409, detail="signal already closed")

    closed = await service.close(db, signal, data)
    await db.commit()
    # Queued after the commit: a callback that fires before the row is durable
    # would report a verdict the database does not have.
    send_verdict.delay(str(closed.id))
    return closed


@router.get("/by-case/{case_id}", response_model=SignalOut)
async def get_signal_for_case(
    case_id: uuid.UUID, db=Depends(get_db), _: dict = Depends(get_current_user)
):
    """Backs the "จาก Horizon" origin badge on a case."""
    from sqlalchemy import select

    from .models import ExternalSignal

    signal = await db.scalar(
        select(ExternalSignal).where(ExternalSignal.investigation_case_id == case_id)
    )
    if signal is None:
        raise HTTPException(status_code=404, detail="case did not originate from a signal")
    return signal
