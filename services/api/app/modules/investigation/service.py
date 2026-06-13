import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from .models import Case, Evidence, CaseScan
from .schemas import CaseCreate, CaseUpdate, EvidenceCreate, EvidenceUpdate, ScanCreate


async def create_case(db: AsyncSession, data: CaseCreate, user_id: str) -> Case:
    case = Case(
        title=data.title,
        description=data.description,
        feed_item_id=data.feed_item_id,
        tags=data.tags,
        created_by=user_id,
    )
    db.add(case)
    await db.flush()
    await db.refresh(case)
    return case


async def list_cases(
    db: AsyncSession, status: str | None = None, page: int = 1, page_size: int = 20
) -> tuple[list[Case], int]:
    q = select(Case)
    if status:
        q = q.where(Case.status == status)
    q = q.order_by(Case.created_at.desc())

    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar_one()

    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return list(rows), total


async def get_case(db: AsyncSession, case_id: uuid.UUID) -> Case | None:
    return (await db.execute(select(Case).where(Case.id == case_id))).scalar_one_or_none()


async def update_case(db: AsyncSession, case: Case, data: CaseUpdate) -> Case:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(case, field, value)
    case.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(case)
    return case


async def delete_case(db: AsyncSession, case: Case) -> None:
    await db.delete(case)


async def add_evidence(db: AsyncSession, case_id: uuid.UUID, data: EvidenceCreate) -> Evidence:
    ev = Evidence(case_id=case_id, **data.model_dump())
    db.add(ev)
    await db.flush()
    await db.refresh(ev)
    return ev


async def list_evidence(db: AsyncSession, case_id: uuid.UUID) -> list[Evidence]:
    q = select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.created_at.desc())
    return list((await db.execute(q)).scalars().all())


async def get_evidence(db: AsyncSession, evidence_id: uuid.UUID) -> Evidence | None:
    return (
        await db.execute(select(Evidence).where(Evidence.id == evidence_id))
    ).scalar_one_or_none()


async def update_evidence(db: AsyncSession, ev: Evidence, data: EvidenceUpdate) -> Evidence:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(ev, field, value)
    ev.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(ev)
    return ev


async def delete_evidence(db: AsyncSession, ev: Evidence) -> None:
    await db.delete(ev)


async def create_scan(db: AsyncSession, case_id: uuid.UUID, data: ScanCreate) -> CaseScan:
    scan = CaseScan(case_id=case_id, target=data.target, scan_type=data.scan_type)
    db.add(scan)
    await db.flush()
    await db.refresh(scan)
    return scan


async def list_scans(db: AsyncSession, case_id: uuid.UUID) -> list[CaseScan]:
    q = select(CaseScan).where(CaseScan.case_id == case_id).order_by(CaseScan.created_at.desc())
    return list((await db.execute(q)).scalars().all())


async def get_scan(db: AsyncSession, scan_id: uuid.UUID) -> CaseScan | None:
    return (
        await db.execute(select(CaseScan).where(CaseScan.id == scan_id))
    ).scalar_one_or_none()


async def cancel_scan(db: AsyncSession, scan: CaseScan) -> CaseScan:
    """Mark scan CANCELLED, revoke Celery task, abort SpiderFoot if running."""
    from ...worker import celery_app
    from ...core.config import get_settings
    import httpx

    # Revoke Celery task (terminate=True kills a running task)
    celery_task_id = (scan.results or {}).get("celery_task_id")
    if celery_task_id:
        try:
            celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")
        except Exception:
            pass

    # Abort SpiderFoot scan if it started
    if scan.external_id:
        sf_url = getattr(get_settings(), "spiderfoot_url", "") or ""
        if sf_url:
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.get(f"{sf_url}/scan/{scan.external_id}/abort")
            except Exception:
                pass

    scan.status = "CANCELLED"
    scan.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(scan)
    return scan
