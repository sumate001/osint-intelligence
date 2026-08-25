"""External signal intake — one table, no changes to any existing model.

A signal is a lead pushed in by Horizon, not a case. It becomes a case only when
an analyst accepts it, which is why `investigation_case_id` is nullable and the
row carries its own lifecycle independent of the Investigation module.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ...core.db import Base

# The FK below points at investigation's `cases` table, and SQLAlchemy resolves
# that by name against the shared metadata. The API process happens to import
# every module's models via main.py, but a Celery worker importing only this one
# would fail to configure the mapper — which is exactly how the verdict callback
# first broke: the HTTP POST succeeded and the task then died recording it.
from ..investigation.models import Case  # noqa: F401

STATUSES = ("pending_review", "accepted", "dismissed", "closed")
#: `off_topic` says the detection was right and the story is simply not this
#: newsroom's beat. It is feedback about relevance, not accuracy, and Horizon
#: must not read it as a detection error — every dismissal used to be sent as
#: `false_signal`, which would have trained the radar against itself.
VERDICTS = ("true_signal", "false_signal", "inconclusive", "off_topic")
CALLBACK_STATUSES = ("pending", "delivered", "failed", "disabled")


class ExternalSignal(Base):
    __tablename__ = "external_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_system: Mapped[str] = mapped_column(String(50), default="horizon", nullable=False)
    #: Horizon's dispatch id. Unique, and the idempotency key for re-delivery.
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, nullable=False, index=True
    )
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(Text, default="")
    #: The inbound body kept verbatim — the analyst view renders from this, and
    #: it is the audit record of what we were actually told.
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pending_review", nullable=False, index=True)
    investigation_case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verdict: Mapped[str | None] = mapped_column(String(30), nullable=True)
    analyst_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    callback_status: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    #: Kept for operators: "which callbacks are stuck, and how hard did we try?"
    callback_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    callback_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
