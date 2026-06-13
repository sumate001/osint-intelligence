from pydantic import BaseModel
from datetime import datetime
from typing import Literal

Verdict = Literal["PRIORITY", "INVESTIGATE", "FAST_TRACK", "PASS"]


class TriageScores(BaseModel):
    relevance: float
    urgency: float
    impact: float
    novelty: float
    reliability: float
    sensitivity: float
    actionability: float
    total: float
    verdict: Verdict
    verdict_reason: str
    entities: dict = {}


class FeedItemOut(BaseModel):
    id: str
    external_id: str
    source_id: str
    source_name: str | None = None
    source_type: str
    title: str
    body: str
    url: str | None
    language: str
    published_at: datetime | None
    ingested_at: datetime
    scored_at: datetime | None

    score_relevance: float | None
    score_urgency: float | None
    score_impact: float | None
    score_novelty: float | None
    score_reliability: float | None
    score_sensitivity: float | None
    score_actionability: float | None
    total_score: float | None

    verdict: str | None
    verdict_reason: str | None

    admiralty_source: str
    admiralty_info: str

    entities: dict
    source_weight: float
    verified_source: bool
    is_read: bool
    is_archived: bool
    case_id: str | None
    media: list

    class Config:
        from_attributes = True


class FeedItemList(BaseModel):
    items: list[FeedItemOut]
    total: int
    page: int
    page_size: int


class FeedItemUpdate(BaseModel):
    is_read: bool | None = None
    is_archived: bool | None = None
    case_id: str | None = None
