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
    #: Lets us fetch the full timeline from Horizon when an analyst accepts.
    #: Null for a weak signal raised on a single unclustered event.
    cluster_id: uuid.UUID | None = None
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
    #: Which standing interest this landed in. None is a real answer with its own
    #: box: the engine surfaced something nobody asked for.
    profile_id: uuid.UUID | None = None
    profile_reason: str | None = None
    received_at: datetime
    closed_at: datetime | None


class SignalListOut(BaseModel):
    items: list[SignalOut]
    total: int


class SignalCountOut(BaseModel):
    """Badge counter for the inbox — the notification mechanism the spec asks for."""

    pending_review: int


class SignalProfileIn(BaseModel):
    """A standing statement of what this newsroom follows."""

    name: str = Field(min_length=1, max_length=120)
    #: Read by the model when categories cannot decide. "เหตุการณ์ไม่สงบใน
    #: ภาคใต้" is a subject, and no category list captures a subject.
    description: str = ""
    #: Horizon's own labels. An overlap decides on its own, without a model call.
    categories: list[str] = Field(default_factory=list)
    active: bool = True


class SignalProfileOut(SignalProfileIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    #: Signals currently sitting in this box awaiting review.
    pending: int = 0


class SignalAccept(BaseModel):
    """Optional overrides when turning a signal into a case."""

    title: str | None = None
    assigned_to: str | None = None


class SignalDismiss(BaseModel):
    """Rejecting a signal without opening a case.

    Two different things were being reported as one. Dismissing used to always
    send `false_signal`, but most dismissals are not "the detection was wrong" —
    they are "this is real, it just is not our beat". Horizon's `verdicts` table
    is the corpus for tuning detection thresholds, so an editor clearing off-beat
    stories was teaching the radar to suppress the detections that were working.
    """

    #: What kind of no this is. `off_topic` is about relevance, `false_signal`
    #: about accuracy, and only the second says anything about the detector.
    verdict: Literal["off_topic", "false_signal"] = "off_topic"
    #: Required: dismissing without a stated reason teaches Horizon nothing.
    reason: str = Field(min_length=1)


class SignalClose(BaseModel):
    """Closing a signal-originated case. The verdict is what Horizon learns from."""

    verdict: Literal["true_signal", "false_signal", "inconclusive", "off_topic"]
    analyst_note: str | None = None


class VerdictCallback(BaseModel):
    """POST {HORIZON_BASE_URL}/api/v1/verdicts — mirrors contracts/verdict.schema.json."""

    model_config = ConfigDict(extra="forbid")

    signal_id: uuid.UUID
    osint_signal_id: str
    verdict: Literal["true_signal", "false_signal", "inconclusive"]
    analyst_note: str | None = None
    closed_at: datetime
