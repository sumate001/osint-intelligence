"""Place names resolved to coordinates, cached.

Horizon extracts a `location` for 80% of events — free text at whatever
granularity the reporting used, "อำเภอยะหา" as readily as "ไทย". Turning that
into a point needs a lookup per distinct name, and the same handful of names
recur constantly: "ทำเนียบรัฐบาล" alone accounts for 48 events. So the answer is
cached against the name rather than fetched per signal.

A row exists as soon as a name has been *asked about*, including when the answer
was "no such place". Without that, every unresolvable name is re-queried forever
against a free API, which is both slow and rude.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ...core.db import Base

#: `resolved` has coordinates. `no_match` was asked and has none — a real answer
#: worth remembering. `pending` has not been asked yet.
GEO_STATUSES = ("pending", "resolved", "no_match")


class Place(Base):
    __tablename__ = "places"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    #: The name exactly as the article wrote it, which is what recurs.
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: The Wikidata item the coordinates came from, so a wrong pin is traceable
    #: to a wrong identification rather than being unexplainable.
    qid: Mapped[str | None] = mapped_column(String(32), nullable=True)
    #: What Wikidata calls it, which is often more precise than the article was.
    label: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
