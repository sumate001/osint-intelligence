from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class DeceptionCheckCreate(BaseModel):
    case_id: str | None = None
    target_title: str
    target_url: str | None = None
    content: str | None = None


class DeceptionCheckOut(BaseModel):
    id: str
    case_id: str | None
    target_title: str
    target_url: str | None
    cui_bono: str | None
    timing_analysis: str | None
    source_motivation: str | None
    bot_indicators: list
    risk_level: str
    flagged: bool
    flag_reason: str | None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
