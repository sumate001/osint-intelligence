from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from .models import PIR
from .schemas import PIRCreate, PIRUpdate


async def create_pir(db: AsyncSession, data: PIRCreate, user_id: str) -> PIR:
    pir = PIR(
        question=data.question,
        priority=data.priority,
        deadline=data.deadline,
        eei_list=[e.model_dump() for e in data.eei_list],
        assigned_to=data.assigned_to,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(pir)
    await db.flush()
    await db.refresh(pir)
    return pir


async def list_pirs(db: AsyncSession, status: str | None = None) -> list[PIR]:
    q = select(PIR).order_by(PIR.priority, desc(PIR.created_at))
    if status:
        q = q.where(PIR.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_pir(db: AsyncSession, pir_id: str) -> PIR | None:
    result = await db.execute(select(PIR).where(PIR.id == pir_id))
    return result.scalar_one_or_none()


async def update_pir(db: AsyncSession, pir: PIR, data: PIRUpdate) -> PIR:
    if data.question is not None:
        pir.question = data.question
    if data.priority is not None:
        pir.priority = data.priority
    if data.status is not None:
        pir.status = data.status
    if data.deadline is not None:
        pir.deadline = data.deadline
    if data.eei_list is not None:
        pir.eei_list = [e.model_dump() for e in data.eei_list]
    if data.notes is not None:
        pir.notes = data.notes
    pir.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(pir)
    return pir


async def delete_pir(db: AsyncSession, pir: PIR) -> None:
    await db.delete(pir)
    await db.flush()
