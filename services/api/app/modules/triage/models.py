import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Boolean, DateTime, JSON, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from ...core.db import Base


class FeedItem(Base):
    """Scored and stored feed item — output of the triage pipeline."""

    __tablename__ = "feed_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Canonical identity
    external_id: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Content
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="th")

    # Timing
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Triage scores (0-10 each)
    score_relevance: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_urgency: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_impact: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_novelty: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_reliability: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_sensitivity: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_actionability: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Verdict: PRIORITY | INVESTIGATE | FAST_TRACK | PASS
    verdict: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    verdict_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reliability
    admiralty_source: Mapped[str] = mapped_column(String(1), default="C")
    admiralty_info: Mapped[str] = mapped_column(String(1), default="3")

    # Extracted entities
    entities: Mapped[dict] = mapped_column(JSON, default=dict)

    # Source trust
    source_weight: Mapped[float] = mapped_column(Float, default=1.0)
    verified_source: Mapped[bool] = mapped_column(Boolean, default=False)

    # Raw data
    raw_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    media: Mapped[list] = mapped_column(JSON, default=list)

    # Workflow
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    case_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
