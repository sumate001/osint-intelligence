from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Any
import uuid

from ..core.db import get_db
from ..core.auth import get_current_user
from ..core.rbac import require_role, Role
from ..models.source import Source

router = APIRouter()


class SourceCreate(BaseModel):
    name: str
    adapter_type: str
    config: dict[str, Any]
    source_weight: float = 1.0
    verified_source: bool = False
    admiralty_source_code: str = "C"
    poll_interval_seconds: int = 300


class SourceUpdate(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    source_weight: float | None = None
    verified_source: bool | None = None
    is_active: bool | None = None
    admiralty_source_code: str | None = None
    poll_interval_seconds: int | None = None


class SourceResponse(BaseModel):
    id: str
    name: str
    adapter_type: str
    config: dict[str, Any]
    source_weight: float
    verified_source: bool
    is_active: bool
    admiralty_source_code: str
    poll_interval_seconds: int
    last_fetched_at: str | None
    last_error: str | None
    success_count: int
    error_count: int

    class Config:
        from_attributes = True


def _source_to_resp(s: Source) -> SourceResponse:
    return SourceResponse(
        id=str(s.id),
        name=s.name,
        adapter_type=s.adapter_type,
        config=s.config,
        source_weight=s.source_weight,
        verified_source=s.verified_source,
        is_active=s.is_active,
        admiralty_source_code=s.admiralty_source_code,
        poll_interval_seconds=s.poll_interval_seconds,
        last_fetched_at=s.last_fetched_at.isoformat() if s.last_fetched_at else None,
        last_error=s.last_error,
        success_count=s.success_count,
        error_count=s.error_count,
    )


@router.get("", response_model=list[SourceResponse])
async def list_sources(
    db: AsyncSession = Depends(get_db),
    _cu: dict = Depends(get_current_user),
):
    result = await db.execute(select(Source).order_by(Source.created_at.desc()))
    return [_source_to_resp(s) for s in result.scalars().all()]


@router.post("", response_model=SourceResponse, status_code=201)
async def create_source(
    body: SourceCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role(Role.ADMIN)),
):
    # inject source_id into config for adapter
    config = dict(body.config)
    config.setdefault("adapter_type", body.adapter_type)

    source = Source(
        name=body.name,
        adapter_type=body.adapter_type,
        config=config,
        source_weight=body.source_weight,
        verified_source=body.verified_source,
        admiralty_source_code=body.admiralty_source_code,
        poll_interval_seconds=body.poll_interval_seconds,
    )
    db.add(source)
    await db.flush()
    # set source_id in config after we have the UUID
    source.config = {**config, "source_id": str(source.id)}
    return _source_to_resp(source)


@router.get("/{source_id}", response_model=SourceResponse)
async def get_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _cu: dict = Depends(get_current_user),
):
    result = await db.execute(select(Source).where(Source.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return _source_to_resp(source)


@router.patch("/{source_id}", response_model=SourceResponse)
async def update_source(
    source_id: uuid.UUID,
    body: SourceUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role(Role.ADMIN)),
):
    result = await db.execute(select(Source).where(Source.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(source, field, value)
    return _source_to_resp(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role(Role.ADMIN)),
):
    result = await db.execute(select(Source).where(Source.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    await db.delete(source)


@router.post("/{source_id}/trigger")
async def trigger_fetch(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role(Role.ADMIN)),
):
    from ..modules.triage.tasks import ingest_source_task
    ingest_source_task.delay(str(source_id))
    return {"status": "triggered", "source_id": str(source_id)}
