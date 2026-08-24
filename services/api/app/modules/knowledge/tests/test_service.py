"""Cross-case memory: what makes a case find its own history.

The store was empty before this — nothing called `upsert_entity` at all — so
these tests describe behaviour that is new, not behaviour being preserved. The
matching order is the substance: a Q-number means the same thing in Horizon,
here and in any export, while a name means only that two articles picked the
same letters.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.knowledge import service
from app.modules.knowledge.models import EntityRecord

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

ANUTIN = "Q16139757"


async def _appear(db: AsyncSession, name: str, case_id: str, **kwargs) -> EntityRecord:
    return await service.upsert_entity(
        db,
        entity_name=name,
        entity_type=kwargs.pop("entity_type", "person"),
        case_id=case_id,
        case_title=kwargs.pop("case_title", f"คดี {case_id}"),
        **kwargs,
    )


async def test_the_same_person_spelled_differently_is_one_record(db: AsyncSession):
    """The failure this exists to fix, stated as a test.

    Two articles, two spellings, one Q-number. Matching on the name would report
    "no prior cases" for someone who already has one — and report it silently.
    """
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-1", qid=ANUTIN)
    record = await _appear(db, "Anutin Charnvirakul", "case-2", qid=ANUTIN)

    assert len(record.cases_involved) == 2
    assert {c["case_id"] for c in record.cases_involved} == {"case-1", "case-2"}


async def test_a_horizon_id_also_identifies_across_spellings(db: AsyncSession):
    """Most entities have no Wikidata item — the internal id still holds."""
    await _appear(db, "ผู้ใหญ่บ้านทุ่งแพม", "case-1", horizon_entity_id="h-1")
    record = await _appear(db, "นายสมชาย (ผู้ใหญ่บ้าน)", "case-2", horizon_entity_id="h-1")

    assert len(record.cases_involved) == 2


async def test_two_people_sharing_a_name_are_kept_apart(db: AsyncSession):
    """Identity beats spelling in both directions, not just the convenient one."""
    await _appear(db, "สมชาย", "case-1", qid="Q1")
    await _appear(db, "สมชาย", "case-2", qid="Q2")

    first = await service.get_entity_by_qid(db, "Q1")
    second = await service.get_entity_by_qid(db, "Q2")
    assert first is not None and second is not None
    assert first.id != second.id
    assert len(first.cases_involved) == 1 and len(second.cases_involved) == 1


async def test_the_name_still_matches_when_there_is_no_identifier(db: AsyncSession):
    """Entities typed by hand have neither id, and must keep working."""
    await _appear(db, "บริษัทตัวอย่าง", "case-1", entity_type="company")
    record = await _appear(db, "บริษัทตัวอย่าง", "case-2", entity_type="company")

    assert len(record.cases_involved) == 2


async def test_a_second_appearance_in_one_case_is_not_two(db: AsyncSession):
    """Accepting the same signal twice must not inflate anyone's history."""
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-1", qid=ANUTIN)
    record = await _appear(db, "อนุทิน ชาญวีรกูล", "case-1", qid=ANUTIN)

    assert len(record.cases_involved) == 1


async def test_a_second_case_is_actually_persisted(db: AsyncSession):
    """Regression: the append used to be invisible to SQLAlchemy.

    `cases_involved` is a plain JSON column, so mutating the list in place and
    assigning it back to the same attribute is not seen as a change and never
    reaches the database. The record looked right in memory and forgot the
    second case on reload — the exact shape of bug this module cannot afford.
    """
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-1", qid=ANUTIN)
    record = await _appear(db, "อนุทิน ชาญวีรกูล", "case-2", qid=ANUTIN)
    entity_id = record.id

    db.expire_all()
    reloaded = await db.get(EntityRecord, entity_id)
    assert len(reloaded.cases_involved) == 2


async def test_identity_learned_later_is_backfilled(db: AsyncSession):
    """An entity typed by hand should start matching once Horizon resolves it."""
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-1")
    record = await _appear(db, "อนุทิน ชาญวีรกูล", "case-2", qid=ANUTIN)

    assert record.qid == ANUTIN
    assert len(record.cases_involved) == 2


async def test_the_cast_of_a_case_reports_only_other_cases(db: AsyncSession):
    """The number that earns the store its keep is "elsewhere", not "total"."""
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-1", qid=ANUTIN)
    await _appear(db, "อนุทิน ชาญวีรกูล", "case-2", qid=ANUTIN)
    await _appear(db, "คนใหม่", "case-2", qid="Q999")

    cast = await service.case_cast(db, "case-2")

    by_name = {member.entity_name: member for member in cast}
    assert len(by_name["อนุทิน ชาญวีรกูล"].prior_cases) == 1
    assert by_name["อนุทิน ชาญวีรกูล"].prior_cases[0].case_id == "case-1"
    assert by_name["คนใหม่"].prior_cases == []


async def test_the_cast_leads_with_whoever_carries_the_most_history(db: AsyncSession):
    await _appear(db, "คนใหม่", "case-3", qid="Q998")
    for case_id in ("case-1", "case-2", "case-3"):
        await _appear(db, "อนุทิน ชาญวีรกูล", case_id, qid=ANUTIN)

    cast = await service.case_cast(db, "case-3")

    assert cast[0].entity_name == "อนุทิน ชาญวีรกูล"
    assert len(cast[0].prior_cases) == 2


async def test_a_case_nobody_appears_in_has_an_empty_cast(db: AsyncSession):
    assert await service.case_cast(db, "case-with-nothing") == []
