import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .models import DWQuery, DWResult, DWAuditLog
from .schemas import DWQueryCreate


async def create_query(db: AsyncSession, data: DWQueryCreate, user_id: str, username: str) -> DWQuery:
    q = DWQuery(
        id=str(uuid.uuid4()),
        query_text=data.query_text,
        reason=data.reason,
        method=data.method,
        created_by=user_id,
    )
    db.add(q)
    await _log(db, user_id, username, f"Query: \"{data.query_text}\" [{data.method}]", {"reason": data.reason})
    await db.flush()
    await db.refresh(q)
    return q


async def get_query(db: AsyncSession, query_id: str) -> DWQuery | None:
    return (await db.execute(select(DWQuery).where(DWQuery.id == query_id))).scalar_one_or_none()


async def list_results(db: AsyncSession, query_id: str | None = None) -> list[DWResult]:
    q = select(DWResult).order_by(DWResult.created_at.desc())
    if query_id:
        q = q.where(DWResult.query_id == query_id)
    return list((await db.execute(q)).scalars().all())


async def get_legal_queue(db: AsyncSession) -> list[DWResult]:
    return list(
        (await db.execute(
            select(DWResult)
            .where(DWResult.legal_status == "PENDING")
            .order_by(DWResult.created_at.desc())
        )).scalars().all()
    )


async def review_result(
    db: AsyncSession, result: DWResult, action: str, user_id: str, username: str
) -> DWResult:
    result.legal_status = "APPROVED" if action == "approve" else "REJECTED"
    await _log(
        db, user_id, username,
        f"Legal Review {result.legal_status}: item #{result.id[:8]}",
        {"result_id": result.id, "classification": result.classification}
    )
    await db.flush()
    await db.refresh(result)
    return result


async def get_result(db: AsyncSession, result_id: str) -> DWResult | None:
    return (await db.execute(select(DWResult).where(DWResult.id == result_id))).scalar_one_or_none()


async def get_audit_log(db: AsyncSession, limit: int = 100) -> list[DWAuditLog]:
    return list(
        (await db.execute(
            select(DWAuditLog).order_by(DWAuditLog.timestamp.desc()).limit(limit)
        )).scalars().all()
    )


async def get_stats(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count()).select_from(DWResult))).scalar() or 0
    flagged = (await db.execute(
        select(func.count()).select_from(DWResult).where(DWResult.classification == "FLAGGED")
    )).scalar() or 0
    blocked = (await db.execute(
        select(func.count()).select_from(DWResult).where(DWResult.classification == "BLOCKED")
    )).scalar() or 0
    legal_pending = (await db.execute(
        select(func.count()).select_from(DWResult).where(DWResult.legal_status == "PENDING")
    )).scalar() or 0
    return {"total": total, "flagged": flagged, "blocked": blocked, "legal_pending": legal_pending}


async def _log(db: AsyncSession, user_id: str | None, username: str, action: str, details: dict) -> None:
    entry = DWAuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        username=username,
        action=action,
        details=details,
    )
    db.add(entry)
