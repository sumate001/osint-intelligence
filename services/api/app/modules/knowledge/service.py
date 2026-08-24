from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from .models import EntityRecord
from .schemas import EntityRecordOut, PatternOut, CaseRef, CastMemberOut


async def _find(
    db: AsyncSession,
    entity_name: str,
    qid: str | None,
    horizon_entity_id: str | None,
) -> EntityRecord | None:
    """The record for this entity, matched on identity before spelling.

    Order matters and is the whole point of the change. A Q-number means the
    same thing in Horizon, here, and in any export; a Horizon id means the same
    thing in both systems; a name means only that two articles chose the same
    letters. Falling back to the name keeps hand-typed entities working, but it
    is the weakest evidence available, not the first thing tried.

    The name fallback also has to *exclude* records that carry a conflicting
    identifier. Two different people are both called สมชาย, and without that
    exclusion the second one would match the first by name and inherit a history
    that is not theirs — the weaker signal quietly overruling the stronger.
    """
    for column, value in (
        (EntityRecord.qid, qid),
        (EntityRecord.horizon_entity_id, horizon_entity_id),
    ):
        if not value:
            continue
        found = (
            await db.execute(select(EntityRecord).where(column == value).limit(1))
        ).scalar_one_or_none()
        if found:
            return found

    query = select(EntityRecord).where(
        func.lower(EntityRecord.entity_name) == entity_name.lower()
    )
    if qid:
        query = query.where(
            or_(EntityRecord.qid.is_(None), EntityRecord.qid == qid)
        )
    if horizon_entity_id:
        query = query.where(
            or_(
                EntityRecord.horizon_entity_id.is_(None),
                EntityRecord.horizon_entity_id == horizon_entity_id,
            )
        )
    return (await db.execute(query.limit(1))).scalar_one_or_none()


async def upsert_entity(
    db: AsyncSession,
    entity_name: str,
    entity_type: str,
    case_id: str,
    case_title: str,
    role: str = "",
    qid: str | None = None,
    horizon_entity_id: str | None = None,
) -> EntityRecord:
    """Record that this entity appeared in this case, and return its history.

    Idempotent per case: accepting the same signal twice, or re-running a
    backfill, must not make one appearance look like two.
    """
    from datetime import datetime, timezone
    now_str = datetime.now(timezone.utc).isoformat()

    record = await _find(db, entity_name, qid, horizon_entity_id)

    if record:
        # Fill in identity learned since the record was first written, so an
        # entity typed by hand starts matching properly once Horizon resolves it.
        if qid and not record.qid:
            record.qid = qid
        if horizon_entity_id and not record.horizon_entity_id:
            record.horizon_entity_id = horizon_entity_id
        cases = list(record.cases_involved or [])
        existing = next((c for c in cases if c.get("case_id") == case_id), None)
        if existing:
            existing["last_seen"] = now_str
        else:
            cases.append({"case_id": case_id, "case_title": case_title, "role": role,
                          "first_seen": now_str, "last_seen": now_str})
        # Reassigned rather than mutated: JSON columns are compared by identity,
        # so an in-place append is not seen as a change and never gets written.
        record.cases_involved = cases
    else:
        record = EntityRecord(
            entity_name=entity_name,
            entity_type=entity_type,
            qid=qid,
            horizon_entity_id=horizon_entity_id,
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


async def get_entity_by_qid(db: AsyncSession, qid: str) -> EntityRecord | None:
    """Look an entity up by the identifier both systems agree on."""
    return (
        await db.execute(select(EntityRecord).where(EntityRecord.qid == qid).limit(1))
    ).scalar_one_or_none()


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


async def case_cast(db: AsyncSession, case_id: str) -> list[CastMemberOut]:
    """Everyone recorded in this case, and where else each has appeared.

    Sorted by how much history each carries, because a name with three prior
    cases is the reason to look at this list at all.
    """
    records = (await db.execute(select(EntityRecord))).scalars().all()

    cast: list[CastMemberOut] = []
    for record in records:
        cases = record.cases_involved or []
        here = next((c for c in cases if c.get("case_id") == case_id), None)
        if here is None:
            continue
        cast.append(
            CastMemberOut(
                entity_name=record.entity_name,
                entity_type=record.entity_type,
                qid=record.qid,
                role=here.get("role", ""),
                prior_cases=[
                    CaseRef(**c) for c in cases if c.get("case_id") != case_id
                ],
            )
        )

    cast.sort(key=lambda member: (-len(member.prior_cases), member.entity_name))
    return cast
