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
