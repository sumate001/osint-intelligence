from datetime import datetime, timezone
from sqlalchemy import Integer, JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    level: Mapped[str] = mapped_column(String(10))   # INFO / WARN / ERROR
    service: Mapped[str] = mapped_column(String(50)) # api / celery / adapters
    message: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
