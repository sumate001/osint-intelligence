import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from ...core.db import Base


class VerifyJob(Base):
    __tablename__ = "verify_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)  # image/video/audio
    minio_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int | None] = mapped_column(nullable=True)

    # PENDING / PROCESSING / DONE / FAILED
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True)

    # EXIF metadata
    exif_data: Mapped[dict] = mapped_column(JSON, default=dict)
    gps_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_timestamp: Mapped[str | None] = mapped_column(String(100), nullable=True)
    camera_make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    camera_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Wayback Machine
    wayback_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    wayback_first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Reverse image / duplicate search
    duplicate_hits: Mapped[list] = mapped_column(JSON, default=list)

    # Audio/video transcript (faster-whisper)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Final verdict: VERIFIED / SUSPICIOUS / UNVERIFIED
    verdict: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verdict_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
