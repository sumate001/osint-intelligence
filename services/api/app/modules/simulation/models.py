import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from ...core.db import Base


class SimulationJob(Base):
    __tablename__ = "simulation_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    case_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    # PENDING / RUNNING / DONE / FAILED

    config: Mapped[dict] = mapped_column(JSON, default=dict)
    # {agents: int, timeframe: int, groups: str, model: str}

    seed_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # assembled from evidence, graph, timeline

    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # {scenarios: [...], signals: [...], timeline: [...], coverage: {...}}

    progress_step: Mapped[int] = mapped_column(default=0)
    # 0-5 matching the 5 steps shown in UI

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
