import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConfidenceRecord(Base):
    __tablename__ = "confidence_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    brief_id: Mapped[str] = mapped_column(String(36), ForeignKey("briefs.id", ondelete="CASCADE"))
    # level: HIGH | MEDIUM | LOW
    level: Mapped[str] = mapped_column(String(10), default="MEDIUM")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    dissent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ACHHypothesis(Base):
    __tablename__ = "ach_hypotheses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    brief_id: Mapped[str] = mapped_column(String(36), ForeignKey("briefs.id", ondelete="CASCADE"))
    hypothesis: Mapped[str] = mapped_column(Text)
    # evidence matrix: list of {evidence_id, text, consistency: CONSISTENT|INCONSISTENT|NEUTRAL|NA}
    evidence_matrix: Mapped[list] = mapped_column(JSON, default=list)
    # likelihood: VERY_LIKELY | LIKELY | UNLIKELY | VERY_UNLIKELY
    likelihood: Mapped[str] = mapped_column(String(20), default="LIKELY")
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
