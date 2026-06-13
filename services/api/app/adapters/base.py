from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from typing import AsyncIterator
from pydantic import BaseModel, Field
import uuid


class SourceType(str, Enum):
    RSS = "rss"
    WIRE = "wire"
    SOCIAL = "social"
    CMS = "cms"
    MESSAGING = "messaging"
    WEBHOOK = "webhook"


class MediaItem(BaseModel):
    url: str
    media_type: str  # image, video, document
    caption: str | None = None


class CanonicalFeedItem(BaseModel):
    # identity
    external_id: str
    source_id: str
    source_type: SourceType

    # content
    title: str
    body: str
    url: str | None = None
    language: str = "th"

    # timing
    published_at: datetime | None = None
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # media
    media: list[MediaItem] = []

    # trust & routing
    source_weight: float = 1.0
    verified_source: bool = False

    # flexibility
    raw_metadata: dict = {}


class AdapterConnectionError(Exception):
    pass


class TransformError(Exception):
    pass


class BaseAdapter(ABC):
    """Base class for all ingestion adapters."""

    def __init__(self, config: dict):
        self.config = config
        self.source_id: str = config["source_id"]
        self.source_weight: float = float(config.get("source_weight", 1.0))
        self.verified_source: bool = bool(config.get("verified_source", False))
        self.last_fetch_time: datetime | None = None
        self._success_count: int = 0
        self._error_count: int = 0

    @property
    def success_rate(self) -> float:
        total = self._success_count + self._error_count
        return self._success_count / total if total > 0 else 1.0

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection and authenticate."""
        ...

    @abstractmethod
    async def fetch(self) -> AsyncIterator[dict]:
        """Fetch raw items — yield one at a time."""
        ...

    @abstractmethod
    def transform(self, raw: dict) -> CanonicalFeedItem:
        """Transform raw → canonical format."""
        ...

    async def health_check(self) -> dict:
        return {
            "source_id": self.source_id,
            "status": "healthy",
            "last_fetch": self.last_fetch_time.isoformat() if self.last_fetch_time else None,
            "success_rate": self.success_rate,
        }

    async def run(self) -> list[CanonicalFeedItem]:
        """Main cycle: connect → fetch → transform → return items."""
        if not await self.connect():
            raise AdapterConnectionError(self.source_id)

        items: list[CanonicalFeedItem] = []
        async for raw in self.fetch():
            try:
                item = self.transform(raw)
                items.append(item)
                self._success_count += 1
            except Exception as e:
                self._error_count += 1
                await self._quarantine(raw, e)

        self.last_fetch_time = datetime.now(timezone.utc)
        return items

    async def _quarantine(self, raw: dict, error: Exception) -> None:
        # Store failed items for later inspection
        import json
        import logging
        logging.getLogger(__name__).warning(
            "Quarantine: source=%s error=%s raw_keys=%s",
            self.source_id,
            str(error),
            list(raw.keys()) if isinstance(raw, dict) else type(raw).__name__,
        )
