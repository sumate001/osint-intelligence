"""Schemas for external signal intake.

`SignalInbound` mirrors contracts/signal_inbound.schema.json field for field.
Do not rename anything here without changing the schema file and the Horizon
repo in the same breath — the two systems agree on this shape or they do not
talk at all.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TopEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    url: str
    source_name: str
    credibility_weight: float = Field(ge=0.0, le=1.0)
    event_time: datetime | None = None


class ForceAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    force: str
    impact: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)


class SignalInbound(BaseModel):
    """POST /api/v1/signals/inbound — the shared contract with Horizon."""

    model_config = ConfigDict(extra="forbid")

    signal_id: uuid.UUID
    signal_type: Literal["weak_signal", "trend_breakout"]
    title: str
    combined_score: float = Field(ge=0.0, le=1.0)
    trend_score: float
    categories: list[str] = []
    summary: str = ""
    top_events: list[TopEvent] = Field(default_factory=list, max_length=10)
    force_assessments: list[ForceAssessment] = []
    scenario_id: uuid.UUID | None = None
    created_at: datetime


class SignalInboundAck(BaseModel):
    osint_signal_id: str


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_system: str
    signal_id: uuid.UUID
    signal_type: str
    title: str
    payload: dict
    status: str
    investigation_case_id: uuid.UUID | None
    verdict: str | None
    analyst_note: str | None
    callback_status: str | None
    received_at: datetime
    closed_at: datetime | None


class SignalListOut(BaseModel):
    items: list[SignalOut]
    total: int


class SignalCountOut(BaseModel):
    """Badge counter for the inbox — the notification mechanism the spec asks for."""

    pending_review: int


class SignalAccept(BaseModel):
    """Optional overrides when turning a signal into a case."""

    title: str | None = None
    assigned_to: str | None = None


class SignalDismiss(BaseModel):
    #: Required: dismissing without a stated reason teaches Horizon nothing.
    reason: str = Field(min_length=1)


class SignalClose(BaseModel):
    """Closing a signal-originated case. The verdict is what Horizon learns from."""

    verdict: Literal["true_signal", "false_signal", "inconclusive"]
    analyst_note: str | None = None


class VerdictCallback(BaseModel):
    """POST {HORIZON_BASE_URL}/api/v1/verdicts — mirrors contracts/verdict.schema.json."""

    model_config = ConfigDict(extra="forbid")

    signal_id: uuid.UUID
    osint_signal_id: str
    verdict: Literal["true_signal", "false_signal", "inconclusive"]
    analyst_note: str | None = None
    closed_at: datetime
