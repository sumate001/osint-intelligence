import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PIR(Base):
    __tablename__ = "pirs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question: Mapped[str] = mapped_column(Text)
    # priority: P1 | P2 | P3
    priority: Mapped[str] = mapped_column(String(5), default="P2")
    # status: ACTIVE | ANSWERED | CANCELLED
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # eei_list: [{id, question, answered: bool}]
    eei_list: Mapped[list] = mapped_column(JSON, default=list)
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    @property
    def progress(self) -> int:
        if not self.eei_list:
            return 0
        answered = sum(1 for e in self.eei_list if e.get("answered"))
        return int(answered / len(self.eei_list) * 100)
