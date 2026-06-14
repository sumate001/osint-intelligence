"""Meilisearch client — full-text search for feed items."""
import logging

import meilisearch

from .config import get_settings

log = logging.getLogger(__name__)

INDEX_NAME = "feed_items"
_client: meilisearch.Client | None = None


def _get_client() -> meilisearch.Client | None:
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    url = getattr(settings, "meilisearch_url", "") or "http://meilisearch:7700"
    key = getattr(settings, "meili_master_key", "") or ""
    try:
        _client = meilisearch.Client(url, key)
        idx = _client.index(INDEX_NAME)
        idx.update_settings({
            "searchableAttributes": ["title", "body", "source_name", "entities"],
            "filterableAttributes": ["verdict", "source_id", "is_archived", "source_type"],
            "sortableAttributes": ["total_score", "published_at", "ingested_at"],
            "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
        })
    except Exception as exc:
        log.warning("Meilisearch init failed: %s", exc)
        _client = None
    return _client


def index_item(item_id: str, doc: dict) -> None:
    """Index a single feed item. Fire-and-forget; errors are logged, not raised."""
    client = _get_client()
    if not client:
        return
    try:
        doc["id"] = item_id
        client.index(INDEX_NAME).add_documents([doc])
    except Exception as exc:
        log.warning("Meilisearch index failed for %s: %s", item_id, exc)


def search_items(query: str, filters: str = "", limit: int = 100) -> list[str]:
    """Return list of matching item IDs (strings). Falls back to [] on error."""
    client = _get_client()
    if not client:
        return []
    try:
        params: dict = {"limit": limit}
        if filters:
            params["filter"] = filters
        result = client.index(INDEX_NAME).search(query, params)
        return [str(hit["id"]) for hit in result.get("hits", [])]
    except Exception as exc:
        log.warning("Meilisearch search failed: %s", exc)
        return []


def delete_item(item_id: str) -> None:
    client = _get_client()
    if not client:
        return
    try:
        client.index(INDEX_NAME).delete_document(item_id)
    except Exception as exc:
        log.warning("Meilisearch delete failed for %s: %s", item_id, exc)
