import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


class DWQuery(Base):
    __tablename__ = "dw_queries"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_text: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)           # editorial purpose (required)
    method: Mapped[str] = mapped_column(String(30), default="ahmia")
    # ahmia / torbot_ahmia / seed
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    # PENDING / RUNNING / DONE / FAILED
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DWResult(Base):
    __tablename__ = "dw_results"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_id: Mapped[str] = mapped_column(UUID(as_uuid=False), index=True)
    onion_url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    classification: Mapped[str] = mapped_column(String(20))
    # PASS / FLAGGED / BLOCKED
    confidence: Mapped[float] = mapped_column(default=0.0)
    entities: Mapped[list] = mapped_column(JSON, default=list)
    legal_status: Mapped[str] = mapped_column(String(20), default="NA")
    # NA / PENDING / APPROVED / REJECTED  (NA = not flagged, no review needed)
    value: Mapped[str] = mapped_column(String(20), default="")
    # HIGH / MED / LOW / ""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class DWAuditLog(Base):
    """Append-only audit log — never delete rows."""
    __tablename__ = "dw_audit_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    username: Mapped[str] = mapped_column(String(100), default="system")
    action: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
