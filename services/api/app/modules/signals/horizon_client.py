"""Read-side client for Horizon.

Horizon owns everything on the way in — ingestion, editorial triage, dedup and
clustering — so the analyst-facing pages here read from it rather than from a
feed of our own. This module is that read path.

It is deliberately separate from `tasks.py`, which is the write path (verdict
callbacks). Reads are best-effort: a page that cannot reach Horizon shows an
empty state, it does not error the request.
"""

import logging
import uuid

import httpx

from ...core.config import get_settings

log = logging.getLogger(__name__)

TIMEOUT = 15.0


class HorizonUnavailable(RuntimeError):
    """Horizon could not be reached or answered with something unusable."""


def _base_url() -> str:
    url = get_settings().horizon_base_url.strip()
    if not url:
        raise HorizonUnavailable("HORIZON_BASE_URL is not configured")
    return url.rstrip("/")


async def _get(path: str, params: dict | None = None):
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{_base_url()}{path}", params=params)
            response.raise_for_status()
            return response.json()
    except HorizonUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 — the caller decides how to degrade
        raise HorizonUnavailable(f"GET {path}: {exc}") from exc


async def list_events(
    *,
    limit: int = 50,
    offset: int = 0,
    verdict: str | None = None,
    order: str = "recent",
) -> list[dict]:
    """The inbound stream as Horizon has scored it."""
    params: dict = {"limit": limit, "offset": offset, "order": order}
    if verdict and verdict != "ALL":
        params["verdict"] = verdict
    return await _get("/api/v1/events", params)


async def event_counts() -> dict:
    return await _get("/api/v1/events/counts")


async def cluster_timeline(cluster_id: uuid.UUID, *, limit: int = 200) -> dict:
    """The full thread behind a signal.

    Fetched when an analyst accepts rather than carried in the signal payload:
    a cluster keeps growing after its signal fires, so by acceptance time —
    often the next day — this is materially more complete than a snapshot taken
    at dispatch. `top_events` in the payload remains the fallback for when
    Horizon is unreachable.
    """
    return await _get(f"/api/v1/clusters/{cluster_id}/timeline", {"limit": limit})


async def cluster_entities(cluster_id: uuid.UUID, *, limit: int = 50) -> dict:
    """Who and what the cluster is about, already resolved by Horizon.

    Names arrive merged across spellings and, where one honestly fits, carrying
    a Wikidata Q-number. That identifier is what lets this side answer "have we
    investigated this person before" truthfully — a name match would report no
    prior cases for someone whose earlier case spelled them differently.
    """
    return await _get(f"/api/v1/clusters/{cluster_id}/entities", {"limit": limit})


async def health() -> bool:
    try:
        await _get("/health")
        return True
    except HorizonUnavailable as exc:
        log.info("Horizon not reachable", extra={"error": str(exc)})
        return False
