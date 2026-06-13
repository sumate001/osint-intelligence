from datetime import datetime
from typing import Any
from pydantic import BaseModel


class SimConfig(BaseModel):
    agents: int = 1000
    timeframe: int = 30       # days
    groups: str = "general"   # general / politics_biz / social
    model: str = "qwen3:8b"


class SimCreate(BaseModel):
    case_id: str | None = None
    config: SimConfig = SimConfig()
    seed_data: dict = {}


class ScenarioOut(BaseModel):
    type: str          # BEST / BASE / WORST
    label: str
    probability: int   # percent
    timeline_weeks: str
    bullets: list[str]


class SignalOut(BaseModel):
    icon: str
    description: str
    priority: str      # HIGH / MED / LOW


class TimelineEvent(BaseModel):
    day: str
    description: str


class PivotPoint(BaseModel):
    condition: str
    consequence: str
    type: str          # KEY / RISK


class ImpactAssessment(BaseModel):
    confidence: str
    scenarios: list[ScenarioOut]
    signals: list[SignalOut]
    timeline: list[TimelineEvent]
    pivot_points: list[PivotPoint]
    coverage_strategy: str


class SimOut(BaseModel):
    id: str
    case_id: str | None
    status: str
    config: dict[str, Any]
    seed_data: dict[str, Any]
    result: dict[str, Any] | None
    progress_step: int
    error: str | None
    created_by: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
