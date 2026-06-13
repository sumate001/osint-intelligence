import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, DateTime, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from ..core.db import Base


class Source(Base):
    """Ingestion source configuration — one row per adapter instance."""

    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    adapter_type: Mapped[str] = mapped_column(String(50), nullable=False)  # rss, webhook, …
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    source_weight: Mapped[float] = mapped_column(Float, default=1.0)
    verified_source: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Admiralty source reliability rating (A-F)
    admiralty_source_code: Mapped[str] = mapped_column(String(1), default="C")

    poll_interval_seconds: Mapped[int] = mapped_column(Integer, default=300)
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
