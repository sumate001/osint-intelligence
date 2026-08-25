"""The newsroom map: where the reporting says things are happening."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from ...core.auth import get_current_user
from ...core.db import get_db
from . import service
from .schemas import MapOut

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/map", tags=["map"])


@router.get("", response_model=MapOut)
async def map_view(
    profile_id: uuid.UUID | None = Query(None, description="limit to one beat"),
    days: int = Query(30, ge=1, le=365),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return await service.map_points(db, profile_id=profile_id, since=since)


@router.post("/geocode")
async def geocode(
    limit: int = Query(40, ge=1, le=200),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Resolve place names that have no point yet.

    A separate call rather than part of intake: it is a network round trip to a
    free API that asks callers to keep the rate modest, and it must not sit on
    the path a signal takes to reaching an analyst.
    """
    counts = await service.resolve_pending(db, limit=limit)
    await db.commit()
    return counts
