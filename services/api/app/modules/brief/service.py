from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone

from .models import Brief
from .schemas import BriefCreate, BriefUpdate


async def create_brief(db: AsyncSession, data: BriefCreate, user_id: str) -> Brief:
    brief = Brief(
        title=data.title,
        case_id=data.case_id,
        sections=[s.model_dump() for s in data.sections],
        summary=data.summary,
        methodology=data.methodology,
        created_by=user_id,
    )
    db.add(brief)
    await db.flush()
    await db.refresh(brief)
    return brief


async def list_briefs(db: AsyncSession, case_id: str | None = None) -> list[Brief]:
    q = select(Brief).order_by(desc(Brief.updated_at))
    if case_id:
        q = q.where(Brief.case_id == case_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_brief(db: AsyncSession, brief_id: str) -> Brief | None:
    result = await db.execute(select(Brief).where(Brief.id == brief_id))
    return result.scalar_one_or_none()


async def update_brief(db: AsyncSession, brief: Brief, data: BriefUpdate) -> Brief:
    if data.title is not None:
        brief.title = data.title
    if data.mode is not None:
        brief.mode = data.mode
    if data.sections is not None:
        brief.sections = [s.model_dump() for s in data.sections]
    if data.summary is not None:
        brief.summary = data.summary
    if data.methodology is not None:
        brief.methodology = data.methodology
    brief.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(brief)
    return brief


async def submit_for_review(db: AsyncSession, brief: Brief) -> Brief:
    brief.status = "PENDING"
    brief.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(brief)
    return brief


async def review_brief(db: AsyncSession, brief: Brief, action: str, reviewer_id: str, note: str | None) -> Brief:
    brief.status = "APPROVED" if action == "approve" else "REJECTED"
    brief.reviewed_by = reviewer_id
    brief.reviewed_at = datetime.now(timezone.utc)
    brief.review_note = note
    brief.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(brief)
    return brief


async def delete_brief(db: AsyncSession, brief: Brief) -> None:
    await db.delete(brief)
    await db.flush()


async def llm_draft_brief(db: AsyncSession, brief: Brief) -> Brief:
    """Generate LLM draft sections from case evidence (best-effort)."""
    from ...core.llm import chat_json
    import uuid as _uuid

    if not brief.case_id:
        return brief

    from ..investigation.models import Evidence
    result = await db.execute(
        select(Evidence).where(Evidence.case_id == brief.case_id)
    )
    evidence = list(result.scalars().all())
    if not evidence:
        return brief

    evidence_text = "\n".join(
        f"- [{e.status}] {e.title}: {e.content[:200]}" for e in evidence[:20]
    )

    messages = [
        {"role": "system", "content": "You are an OSINT analyst. Return only valid JSON, no markdown."},
        {"role": "user", "content": (
            f"Given evidence from case \"{brief.title}\", produce a structured brief:\n"
            '{"summary":"...","findings_verified":["..."],"findings_unverified":["..."],"missing_links":["..."],"methodology":"..."}\n\n'
            f"Evidence:\n{evidence_text}"
        )},
    ]

    try:
        import uuid as _uuid2
        parsed = await chat_json(messages, module="brief")
        if parsed:
            sections = []
            for key, section_title, stype in [
                ("findings_verified", "FINDINGS — VERIFIED", "findings_verified"),
                ("findings_unverified", "UNVERIFIED — DO NOT PUBLISH", "findings_unverified"),
                ("missing_links", "MISSING LINKS", "missing_links"),
            ]:
                items = [
                    {"id": str(_uuid2.uuid4()), "text": t, "verified": key == "findings_verified", "sources": []}
                    for t in (parsed.get(key) or [])
                ]
                sections.append({"id": str(_uuid2.uuid4()), "type": stype, "title": section_title, "items": items})
            brief.sections = sections
            brief.summary = parsed.get("summary", "")
            brief.methodology = parsed.get("methodology", "")
            brief.updated_at = datetime.now(timezone.utc)
            await db.flush()
            await db.refresh(brief)
    except Exception:
        pass  # LLM draft is best-effort

    return brief
