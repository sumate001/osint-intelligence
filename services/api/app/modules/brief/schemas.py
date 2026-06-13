from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class BriefItem(BaseModel):
    id: str
    text: str
    verified: bool = False
    sources: list[str] = []


class BriefSection(BaseModel):
    id: str
    type: str  # findings_verified | findings_unverified | missing_links | methodology
    title: str
    items: list[BriefItem] = []


class BriefCreate(BaseModel):
    title: str
    case_id: str | None = None
    sections: list[BriefSection] = []
    summary: str | None = None
    methodology: str | None = None


class BriefUpdate(BaseModel):
    title: str | None = None
    mode: str | None = None
    sections: list[BriefSection] | None = None
    summary: str | None = None
    methodology: str | None = None


class BriefReview(BaseModel):
    action: str  # approve | reject
    note: str | None = None


class BriefOut(BaseModel):
    id: str
    case_id: str | None
    title: str
    mode: str
    status: str
    sections: list[BriefSection]
    summary: str | None
    methodology: str | None
    created_by: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BriefListItem(BaseModel):
    id: str
    title: str
    mode: str
    status: str
    case_id: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
