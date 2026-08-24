from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class CaseRef(BaseModel):
    case_id: str
    case_title: str
    role: str = ""
    first_seen: str = ""
    last_seen: str = ""


class EntityRecordOut(BaseModel):
    id: str
    entity_name: str
    entity_type: str
    #: Wikidata identifier when Horizon found one that honestly fits. Null is
    #: the normal answer for local figures, not a gap to be filled.
    qid: str | None = None
    horizon_entity_id: str | None = None
    cases_involved: list[CaseRef]
    notes: str | None
    first_seen: datetime
    last_seen: datetime

    model_config = {"from_attributes": True}


class PatternOut(BaseModel):
    entity_name: str
    entity_type: str
    case_count: int
    cases: list[str]


class CastMemberOut(BaseModel):
    """One entity in a case, with what is known about it from elsewhere."""

    entity_name: str
    entity_type: str
    qid: str | None = None
    role: str = ""
    #: Cases other than the one being viewed. This is the number that earns the
    #: whole entity store its keep — zero means nothing to say, and anything
    #: above zero is a lead an analyst would otherwise have to remember.
    prior_cases: list[CaseRef] = []
