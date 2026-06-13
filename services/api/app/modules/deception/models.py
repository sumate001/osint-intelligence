import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DeceptionCheck(Base):
    __tablename__ = "deception_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    target_title: Mapped[str] = mapped_column(String(500))
    target_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # LLM-generated analysis
    cui_bono: Mapped[str | None] = mapped_column(Text, nullable=True)
    timing_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    bot_indicators: Mapped[list] = mapped_column(JSON, default=list)
    # risk_level: LOW | MEDIUM | HIGH
    risk_level: Mapped[str] = mapped_column(String(10), default="LOW")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
