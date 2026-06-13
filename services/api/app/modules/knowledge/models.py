import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EntityRecord(Base):
    __tablename__ = "entity_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_name: Mapped[str] = mapped_column(String(500), index=True)
    # entity_type: person | company | domain | ip | phone | location | other
    entity_type: Mapped[str] = mapped_column(String(50), default="other")
    # cases_involved: [{case_id, case_title, role, first_seen, last_seen}]
    cases_involved: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
