from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from .models import EntityRecord
from .schemas import EntityRecordOut, PatternOut, CaseRef


async def upsert_entity(
    db: AsyncSession,
    entity_name: str,
    entity_type: str,
    case_id: str,
    case_title: str,
    role: str = "",
) -> EntityRecord:
    from datetime import datetime, timezone
    now_str = datetime.now(timezone.utc).isoformat()

    result = await db.execute(
        select(EntityRecord).where(
            func.lower(EntityRecord.entity_name) == entity_name.lower()
        )
    )
    record = result.scalar_one_or_none()

    if record:
        cases = record.cases_involved or []
        existing = next((c for c in cases if c.get("case_id") == case_id), None)
        if not existing:
            cases.append({"case_id": case_id, "case_title": case_title, "role": role,
                          "first_seen": now_str, "last_seen": now_str})
            record.cases_involved = cases
    else:
        record = EntityRecord(
            entity_name=entity_name,
            entity_type=entity_type,
            cases_involved=[{"case_id": case_id, "case_title": case_title, "role": role,
                             "first_seen": now_str, "last_seen": now_str}],
        )
        db.add(record)

    await db.flush()
    await db.refresh(record)
    return record


async def search_entities(db: AsyncSession, q: str, limit: int = 20) -> list[EntityRecord]:
    result = await db.execute(
        select(EntityRecord)
        .where(EntityRecord.entity_name.ilike(f"%{q}%"))
        .order_by(EntityRecord.last_seen.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_entity(db: AsyncSession, entity_name: str) -> EntityRecord | None:
    result = await db.execute(
        select(EntityRecord).where(
            func.lower(EntityRecord.entity_name) == entity_name.lower()
        )
    )
    return result.scalar_one_or_none()


async def get_patterns(db: AsyncSession, min_cases: int = 2) -> list[PatternOut]:
    result = await db.execute(select(EntityRecord))
    records = result.scalars().all()
    patterns = []
    for r in records:
        cases = r.cases_involved or []
        if len(cases) >= min_cases:
            patterns.append(PatternOut(
                entity_name=r.entity_name,
                entity_type=r.entity_type,
                case_count=len(cases),
                cases=[c.get("case_title", c.get("case_id", "")) for c in cases],
            ))
    patterns.sort(key=lambda p: p.case_count, reverse=True)
    return patterns[:50]
