import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from .models import DeceptionCheck
from .schemas import DeceptionCheckCreate

log = logging.getLogger(__name__)


async def run_check(db: AsyncSession, data: DeceptionCheckCreate, user_id: str) -> DeceptionCheck:
    check = DeceptionCheck(
        case_id=data.case_id,
        target_title=data.target_title,
        target_url=data.target_url,
        content=data.content,
        created_by=user_id,
    )
    db.add(check)
    await db.flush()

    # LLM analysis
    try:
        from ...core.llm import chat_json
        content_snippet = (data.content or "")[:600]
        messages = [
            {"role": "system", "content": "You are a counter-intelligence analyst. Return only valid JSON, no markdown."},
            {"role": "user", "content": (
                f"Analyze this news item for deception indicators.\n"
                f"Title: {data.target_title}\nURL: {data.target_url or ''}\nContent: {content_snippet}\n\n"
                'Return JSON: {"cui_bono":"who benefits","timing_analysis":"is timing suspicious",'
                '"source_motivation":"possible hidden motivation","bot_indicators":["signals"],'
                '"risk_level":"LOW or MEDIUM or HIGH","flagged":true_or_false,"flag_reason":"reason if flagged"}'
            )},
        ]
        parsed = await chat_json(messages, module="triage")
        if parsed:
            # coerce to str — model sometimes returns booleans for text fields
            def _s(v: object) -> str | None:
                if v is None:
                    return None
                if isinstance(v, str):
                    return v or None
                return str(v)

            check.cui_bono = _s(parsed.get("cui_bono"))
            check.timing_analysis = _s(parsed.get("timing_analysis"))
            check.source_motivation = _s(parsed.get("source_motivation"))
            check.bot_indicators = parsed.get("bot_indicators") or []
            check.risk_level = _s(parsed.get("risk_level")) or "LOW"
            check.flagged = bool(parsed.get("flagged"))
            check.flag_reason = _s(parsed.get("flag_reason"))
    except Exception as exc:
        log.error("Deception LLM failed for %s: %s", data.target_title[:40], exc)
        check.risk_level = "LOW"

    await db.flush()
    await db.refresh(check)
    return check


async def list_checks(db: AsyncSession, case_id: str | None = None) -> list[DeceptionCheck]:
    q = select(DeceptionCheck).order_by(desc(DeceptionCheck.created_at)).limit(100)
    if case_id:
        q = q.where(DeceptionCheck.case_id == case_id)
    result = await db.execute(q)
    return list(result.scalars().all())
