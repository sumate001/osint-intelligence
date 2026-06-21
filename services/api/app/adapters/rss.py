import hashlib
import html
import logging
import re
from datetime import datetime, timezone
from typing import AsyncIterator
import feedparser
from dateutil import parser as dateparser

from .base import BaseAdapter, CanonicalFeedItem, SourceType, TransformError

logger = logging.getLogger(__name__)

# feedparser returns structs, not plain dicts — wrap to satisfy type hints
_Struct = object

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    """Remove HTML tags and decode entities. Google News RSS embeds <a> tags in titles."""
    if not text:
        return ""
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return " ".join(text.split())


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
        title = _strip_html(raw.get("title", ""))
        if not title:
            raise TransformError("Missing title")

        published_at = self._parse_date(raw.get("published"))

        from .base import MediaItem
        media: list[MediaItem] = []
        for enc in raw.get("enclosures", []):
            media_type = enc.get("type", "")
            url = enc.get("href", "")
            if url and "image" in media_type:
                media.append(MediaItem(url=url, media_type="image"))
            elif url and "video" in media_type:
                media.append(MediaItem(url=url, media_type="video"))
        # media_content (YouTube, podcasts, etc.)
        for mc in raw.get("media_content", []):
            media_type = mc.get("type", "")
            url = mc.get("url", "")
            if url and "image" in media_type and not any(m.url == url for m in media):
                media.append(MediaItem(url=url, media_type="image"))
            elif url and "video" in media_type and not any(m.url == url for m in media):
                media.append(MediaItem(url=url, media_type="video"))

        return CanonicalFeedItem(
            external_id=raw["_entry_id"],
            source_id=self.source_id,
            source_type=SourceType.RSS,
            title=title,
            body=_strip_html(raw.get("summary", "")),
            url=raw.get("link"),
            published_at=published_at,
            source_weight=self.source_weight,
            verified_source=self.verified_source,
            media=media,
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
