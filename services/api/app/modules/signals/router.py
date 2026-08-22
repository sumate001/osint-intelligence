"""External signal intake — HTTP only, all logic in service.py.

Two audiences on one router:
  - `/inbound` is machine-facing, authenticated by a shared key from Horizon
  - everything else is analyst-facing, authenticated by the normal user session
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ...core.auth import get_current_user
from ...core.config import get_settings
from ...core.db import get_db
from ..investigation.schemas import CaseOut
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
)
from .tasks import send_verdict

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
    signal, _created = await service.ingest(db, data)
    return SignalInboundAck(osint_signal_id=str(signal.id))


# ── Analyst-facing ───────────────────────────────────────────────────────────


@router.get("", response_model=SignalListOut)
async def list_signals(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    items, total = await service.list_signals(db, status=status, page=page, page_size=page_size)
    return SignalListOut(items=items, total=total)


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
