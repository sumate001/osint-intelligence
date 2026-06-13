from datetime import datetime
from pydantic import BaseModel


class DWQueryCreate(BaseModel):
    query_text: str
    reason: str
    method: str = "ahmia"   # ahmia / torbot_ahmia / seed


class DWQueryOut(BaseModel):
    id: str
    query_text: str
    reason: str
    method: str
    status: str
    created_by: str | None
    created_at: datetime
    completed_at: datetime | None
    model_config = {"from_attributes": True}


class DWResultOut(BaseModel):
    id: str
    query_id: str
    onion_url: str
    title: str
    summary: str
    classification: str
    confidence: float
    entities: list
    legal_status: str
    value: str
    created_at: datetime
    model_config = {"from_attributes": True}


class LegalReviewAction(BaseModel):
    action: str   # approve / reject


class DWAuditEntry(BaseModel):
    id: str
    timestamp: datetime
    user_id: str | None
    username: str
    action: str
    details: dict
    model_config = {"from_attributes": True}


class DWStatsOut(BaseModel):
    total: int
    flagged: int
    blocked: int
    legal_pending: int
