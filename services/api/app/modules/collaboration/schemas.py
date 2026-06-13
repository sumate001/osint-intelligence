from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class ActivityOut(BaseModel):
    id: str
    case_id: str
    action_type: str
    actor_id: str
    actor_name: str
    description: str
    entity_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    text: str
    is_dissent: bool = False


class CommentOut(BaseModel):
    id: str
    evidence_id: str
    case_id: str
    author_id: str
    author_name: str
    text: str
    is_dissent: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
