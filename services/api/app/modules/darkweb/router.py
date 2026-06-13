from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.db import get_db
from ...core.auth import get_current_user
from ...core.rbac import require_role, Role
from .schemas import DWQueryCreate, DWQueryOut, DWResultOut, LegalReviewAction, DWAuditEntry, DWStatsOut
from . import service
from .tasks import run_darkweb_query

router = APIRouter()


@router.post("/queries", response_model=DWQueryOut, status_code=201)
async def start_query(
    data: DWQueryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not data.reason.strip():
        raise HTTPException(400, "ต้องระบุ editorial purpose ก่อนเสมอ")
    q = await service.create_query(db, data, current_user["id"], current_user.get("email", "unknown"))
    run_darkweb_query.delay(str(q.id))
    return q


@router.get("/queries", response_model=list[DWQueryOut])
async def list_queries(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    from sqlalchemy import select
    from .models import DWQuery
    return list((await db.execute(select(DWQuery).order_by(DWQuery.created_at.desc()).limit(50))).scalars().all())


@router.get("/results", response_model=list[DWResultOut])
async def list_results(
    query_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.list_results(db, query_id=query_id)


@router.get("/legal-queue", response_model=list[DWResultOut])
async def legal_queue(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.get_legal_queue(db)


@router.post("/results/{result_id}/review", response_model=DWResultOut)
async def review_result(
    result_id: str,
    action: LegalReviewAction,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.EDITOR)),
):
    result = await service.get_result(db, result_id)
    if not result:
        raise HTTPException(404, "Result not found")
    if result.legal_status not in ("PENDING",):
        raise HTTPException(400, "Result is not pending review")
    return await service.review_result(
        db, result, action.action, current_user["id"], current_user.get("email", "unknown")
    )


@router.get("/audit-log", response_model=list[DWAuditEntry])
async def audit_log(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role(Role.EDITOR)),
):
    return await service.get_audit_log(db)


@router.get("/stats", response_model=DWStatsOut)
async def stats(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.get_stats(db)
