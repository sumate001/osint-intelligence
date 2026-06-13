from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .models import ConfidenceRecord, ACHHypothesis
from .schemas import ConfidenceSet, ACHCreate


async def set_confidence(db: AsyncSession, brief_id: str, data: ConfidenceSet, user_id: str) -> ConfidenceRecord:
    result = await db.execute(
        select(ConfidenceRecord).where(ConfidenceRecord.brief_id == brief_id)
    )
    record = result.scalar_one_or_none()
    if record:
        record.level = data.level
        record.rationale = data.rationale
        record.dissent = data.dissent
    else:
        record = ConfidenceRecord(
            brief_id=brief_id,
            level=data.level,
            rationale=data.rationale,
            dissent=data.dissent,
            created_by=user_id,
        )
        db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


async def get_confidence(db: AsyncSession, brief_id: str) -> ConfidenceRecord | None:
    result = await db.execute(
        select(ConfidenceRecord).where(ConfidenceRecord.brief_id == brief_id)
    )
    return result.scalar_one_or_none()


async def add_hypothesis(db: AsyncSession, brief_id: str, data: ACHCreate, user_id: str) -> ACHHypothesis:
    hyp = ACHHypothesis(
        brief_id=brief_id,
        hypothesis=data.hypothesis,
        evidence_matrix=[e.model_dump() for e in data.evidence_matrix],
        likelihood=data.likelihood,
        created_by=user_id,
    )
    db.add(hyp)
    await db.flush()
    await db.refresh(hyp)
    return hyp


async def list_hypotheses(db: AsyncSession, brief_id: str) -> list[ACHHypothesis]:
    result = await db.execute(
        select(ACHHypothesis).where(ACHHypothesis.brief_id == brief_id)
    )
    return list(result.scalars().all())


async def delete_hypothesis(db: AsyncSession, hyp: ACHHypothesis) -> None:
    await db.delete(hyp)
    await db.flush()
