from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from .models import CaseActivity, EvidenceComment
from .schemas import CommentCreate


async def log_activity(
    db: AsyncSession,
    case_id: str,
    action_type: str,
    actor_id: str,
    actor_name: str,
    description: str,
    entity_id: str | None = None,
) -> CaseActivity:
    activity = CaseActivity(
        case_id=case_id,
        action_type=action_type,
        actor_id=actor_id,
        actor_name=actor_name,
        description=description,
        entity_id=entity_id,
    )
    db.add(activity)
    await db.flush()
    return activity


async def get_activity(db: AsyncSession, case_id: str, limit: int = 50) -> list[CaseActivity]:
    result = await db.execute(
        select(CaseActivity)
        .where(CaseActivity.case_id == case_id)
        .order_by(desc(CaseActivity.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())


async def add_comment(
    db: AsyncSession,
    evidence_id: str,
    case_id: str,
    data: CommentCreate,
    author_id: str,
    author_name: str,
) -> EvidenceComment:
    comment = EvidenceComment(
        evidence_id=evidence_id,
        case_id=case_id,
        author_id=author_id,
        author_name=author_name,
        text=data.text,
        is_dissent=data.is_dissent,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment


async def get_comments(db: AsyncSession, evidence_id: str) -> list[EvidenceComment]:
    result = await db.execute(
        select(EvidenceComment)
        .where(EvidenceComment.evidence_id == evidence_id)
        .order_by(EvidenceComment.created_at)
    )
    return list(result.scalars().all())


async def get_case_comments(db: AsyncSession, case_id: str) -> list[EvidenceComment]:
    result = await db.execute(
        select(EvidenceComment)
        .where(EvidenceComment.case_id == case_id)
        .order_by(desc(EvidenceComment.created_at))
        .limit(100)
    )
    return list(result.scalars().all())


async def delete_comment(db: AsyncSession, comment: EvidenceComment) -> None:
    await db.delete(comment)
    await db.flush()
