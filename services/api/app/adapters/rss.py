import hashlib
import logging
from datetime import datetime, timezone
from typing import AsyncIterator
import feedparser
from dateutil import parser as dateparser

from .base import BaseAdapter, CanonicalFeedItem, SourceType, TransformError

logger = logging.getLogger(__name__)

# feedparser returns structs, not plain dicts — wrap to satisfy type hints
_Struct = object


class RSSAdapter(BaseAdapter):
    """RSS / Atom feed ingestion adapter."""

    def __init__(self, config: dict):
        super().__init__(config)
        self.feed_url: str = config.get("feed_url") or config.get("url", "")
        self._seen_ids: set[str] = set()

    async def connect(self) -> bool:
        # RSS does not require authentication in most cases
        return bool(self.feed_url)

    async def fetch(self) -> AsyncIterator[dict]:  # type: ignore[override]
        feed = feedparser.parse(self.feed_url)
        if feed.bozo and not feed.entries:
            logger.warning("RSS parse error for %s: %s", self.feed_url, feed.bozo_exception)
            return

        for entry in feed.entries:
            entry_id = self._entry_id(entry)
            if entry_id in self._seen_ids:
                continue
            self._seen_ids.add(entry_id)
            # convert feedparser struct to plain dict
            yield {
                "_entry_id": entry_id,
                "title": getattr(entry, "title", ""),
                "summary": getattr(entry, "summary", "") or getattr(entry, "description", ""),
                "link": getattr(entry, "link", None),
                "published": getattr(entry, "published", None),
                "author": getattr(entry, "author", None),
                "tags": [t.get("term", "") for t in getattr(entry, "tags", [])],
                "media_content": getattr(entry, "media_content", []),
                "enclosures": getattr(entry, "enclosures", []),
            }

    def transform(self, raw: dict) -> CanonicalFeedItem:
        title = raw.get("title", "").strip()
        if not title:
            raise TransformError("Missing title")

        published_at = self._parse_date(raw.get("published"))

        media = []
        for enc in raw.get("enclosures", []):
            media_type = enc.get("type", "")
            if "image" in media_type:
                media.append({"url": enc.get("href", ""), "media_type": "image"})
            elif "video" in media_type:
                media.append({"url": enc.get("href", ""), "media_type": "video"})

        return CanonicalFeedItem(
            external_id=raw["_entry_id"],
            source_id=self.source_id,
            source_type=SourceType.RSS,
            title=title,
            body=raw.get("summary", ""),
            url=raw.get("link"),
            published_at=published_at,
            source_weight=self.source_weight,
            verified_source=self.verified_source,
            raw_metadata={
                "author": raw.get("author"),
                "tags": raw.get("tags", []),
                "feed_url": self.feed_url,
            },
        )

    @staticmethod
    def _entry_id(entry) -> str:
        # prefer explicit id, fall back to link hash
        entry_id = getattr(entry, "id", None) or getattr(entry, "link", None)
        if not entry_id:
            entry_id = hashlib.sha1(
                (getattr(entry, "title", "") + getattr(entry, "published", "")).encode()
            ).hexdigest()
        return entry_id

    @staticmethod
    def _parse_date(raw: str | None) -> datetime | None:
        if not raw:
            return None
        try:
            dt = dateparser.parse(raw)
            if dt and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None
