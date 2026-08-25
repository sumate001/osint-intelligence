"""Turning the place names in the news into points on a map.

Wikidata is the source, reached through the same two-step it takes for people:
find the item, then read its coordinate claim (P625). It is used rather than a
geocoder because the identifiers are already the currency between Horizon and
here — a pin can be traced to the item it came from, so a wrong pin is a wrong
identification rather than an unexplainable dot.

Resolution is cached per name and every outcome is written, including "Wikidata
has nothing". Without that, an unresolvable name is re-queried forever against a
free API, and "ทำเนียบรัฐบาล" alone appears in 48 events.
"""

import asyncio
import re
import uuid
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Place

log = logging.getLogger(__name__)

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
#: Wikimedia asks automated clients to identify themselves.
USER_AGENT = "osint-desk-newsroom/0.1 (self-hosted; contact via repo)"
#: Free API, so the rate is kept modest by hand rather than by their patience.
#: Trying several administrative levels per name multiplies requests — an address
#: costs up to four searches plus a describe each — and a flat one-second gap was
#: not enough: Wikidata started answering 429 and every name in the batch failed,
#: including ones that had resolved a minute earlier.
MIN_INTERVAL = 1.0
#: Added to the gap after a 429, and decayed back down on success. A refusal is
#: about the client as a whole, not the one request that met it, so slowing down
#: has to outlive the request that caused it.
PENALTY_STEP = 3.0
MAX_PENALTY = 30.0
TIMEOUT = 20.0

#: Coordinates on Earth. Anything outside is a parsing accident, not a place.
_LAT, _LON = 90.0, 180.0

#: Thai reporting gives an address, not a place name: "สำนักงานเทศบาลตำบลพ่อมิ่ง
#: หมู่ที่ 3 ตำบลพ่อมิ่ง อำเภอปะนาเระ จังหวัดปัตตานี". Wikidata has no item for
#: the whole string and does have one for each administrative unit inside it, so
#: the units are pulled out and tried from most specific to least. A district is
#: a far more useful pin than a province, and a province beats nothing.
#: Ordered by how tightly each level pins a map, not by string length: a
#: subdistrict office is a better pin than the province containing it, and
#: sorting by length put "เทศบาลตำบลพ่อมิ่ง" ahead of "อำเภอปะนาเระ" only by
#: accident of spelling.
_LEVELS = (
    re.compile(r"เทศบาล(?:ตำบล|เมือง|นคร)[^\s,]+"),
    re.compile(r"(?:อำเภอ|เขต)[^\s,]+"),
    re.compile(r"อ\.[^\s,]+"),
    re.compile(r"จังหวัด[^\s,]+"),
    re.compile(r"จ\.[^\s,]+"),
)


def candidates(name: str) -> list[str]:
    """The forms worth asking Wikidata about, most specific first.

    Thai reporting gives an address rather than a place name — "สำนักงานเทศบาล
    ตำบลพ่อมิ่ง หมู่ที่ 3 ตำบลพ่อมิ่ง อำเภอปะนาเระ จังหวัดปัตตานี". Wikidata has
    no item for the whole string and has one for each administrative unit inside
    it, so the units come out and are tried from the tightest pin to the loosest.
    """
    out = [name]
    for level in _LEVELS:
        out.extend(level.findall(name))
    return list(dict.fromkeys(out))

_last_call = 0.0
_penalty = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _pace() -> None:
    global _last_call
    wait = (MIN_INTERVAL + _penalty) - (asyncio.get_event_loop().time() - _last_call)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_call = asyncio.get_event_loop().time()


async def _get(client: httpx.AsyncClient, params: dict) -> dict:
    global _penalty
    await _pace()
    response = await client.get(
        WIKIDATA_API,
        params={**params, "format": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT,
    )
    if response.status_code == 429:
        # Honour Retry-After when they send one; they know their own load better
        # than a constant does.
        retry_after = float(response.headers.get("Retry-After") or 0)
        _penalty = min(MAX_PENALTY, max(_penalty + PENALTY_STEP, retry_after))
        log.info("wikidata asked us to slow down", extra={"penalty": _penalty})
        await asyncio.sleep(_penalty)
        await _pace()
        response = await client.get(
            WIKIDATA_API,
            params={**params, "format": "json"},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
    response.raise_for_status()
    # Decay rather than reset: one success after a refusal is not evidence that
    # the pressure is off.
    _penalty = max(0.0, _penalty - PENALTY_STEP / 3)
    return response.json()


async def lookup(name: str, client: httpx.AsyncClient | None = None) -> dict | None:
    """Coordinates for a place name, or None when Wikidata has nothing.

    Thai reporting names places at every level — "อำเภอยะหา", "จังหวัดนราธิวาส",
    "ไทย" — and all three resolve, at very different usefulness. That is the
    caller's problem to judge, not this function's to flatten.
    """
    owned = client is None
    client = client or httpx.AsyncClient()
    try:
        for term in candidates(name):
            answer = await _search(client, term)
            if answer is not None:
                return answer
        return None
    finally:
        if owned:
            await client.aclose()


async def _search(client: httpx.AsyncClient, term: str) -> dict | None:
    """One Wikidata search, returning the first candidate that is actually a place."""
    found = await _get(
        client,
        {"action": "wbsearchentities", "search": term, "language": "th", "limit": 3},
    )
    for hit in found.get("search") or []:
        described = await _get(
            client, {"action": "wbgetentities", "ids": hit["id"], "props": "claims|labels"}
        )
        entity = (described.get("entities") or {}).get(hit["id"]) or {}
        claims = (entity.get("claims") or {}).get("P625") or []
        if not claims:
            # No coordinate claim means it is not a place: the same name can be a
            # film, a song or a person. Try the next candidate rather than
            # pinning the newsroom's map to an album.
            continue
        value = claims[0]["mainsnak"]["datavalue"]["value"]
        lat, lon = float(value["latitude"]), float(value["longitude"])
        if abs(lat) > _LAT or abs(lon) > _LON:
            continue
        labels = entity.get("labels") or {}
        return {
            "qid": hit["id"],
            "latitude": lat,
            "longitude": lon,
            "label": (labels.get("th") or labels.get("en") or {}).get("value"),
        }
    return None


async def resolve(db: AsyncSession, name: str, client: httpx.AsyncClient | None = None) -> Place:
    """The cached point for this name, asking Wikidata only the first time."""
    place = (
        await db.execute(select(Place).where(Place.name == name))
    ).scalar_one_or_none()
    if place is not None and place.status != "pending":
        return place
    if place is None:
        place = Place(name=name)
        db.add(place)

    try:
        answer = await lookup(name, client=client)
    except Exception as exc:  # noqa: BLE001 — a map is worth having incomplete
        # Left `pending` on purpose: a network failure is not an answer, and the
        # next run should ask again rather than remember a non-result.
        log.warning("geocoding failed", extra={"place": name, "error": str(exc)})
        await db.flush()
        return place

    if answer is None:
        place.status = "no_match"
    else:
        place.latitude, place.longitude = answer["latitude"], answer["longitude"]
        place.qid, place.label, place.status = answer["qid"], answer["label"], "resolved"
    place.resolved_at = _now()
    await db.flush()
    return place


# ── assembling the map ───────────────────────────────────────────────────────


async def map_points(
    db: AsyncSession,
    *,
    profile_id: uuid.UUID | None = None,
    since: datetime | None = None,
) -> dict:
    """Every located event across the signals, grouped by place.

    Grouped by place rather than listed by event on purpose: the same district
    turns up in a dozen signals over a week, and a dozen pins on one dot reads
    as noise where one pin saying twelve reads as a pattern.
    """
    from ..signals.models import ExternalSignal

    query = select(ExternalSignal)
    if profile_id is not None:
        query = query.where(ExternalSignal.profile_id == profile_id)
    if since is not None:
        query = query.where(ExternalSignal.received_at >= since)
    signals = (await db.execute(query)).scalars().all()

    wanted: dict[str, list[dict]] = {}
    for signal in signals:
        for event in (signal.payload or {}).get("top_events") or []:
            place = (event.get("location") or "").strip()
            if not place:
                continue
            wanted.setdefault(place, []).append(
                {
                    "when": event.get("event_time"),
                    "summary": event.get("summary", ""),
                    "source_name": event.get("source_name", ""),
                    "url": event.get("url", ""),
                    "signal_id": signal.id,
                    "signal_title": signal.title,
                    "profile_id": signal.profile_id,
                }
            )
    if not wanted:
        return {"points": [], "unresolved": [], "unresolved_events": 0}

    known = {
        p.name: p
        for p in (
            await db.execute(select(Place).where(Place.name.in_(list(wanted))))
        ).scalars()
    }

    # Grouped by the place resolved to, not by how the article spelled it.
    # "จ.กาฬสินธุ์", "จังหวัดกาฬสินธุ์" and "กาฬสินธุ์" are one province and were
    # three pins stacked on one dot — the same identity problem the entity layer
    # exists to solve, arriving again by a different road. The Q-number is what
    # they agree on.
    merged: dict[str, dict] = {}
    unresolved, unresolved_events = [], 0
    for name, events in wanted.items():
        place = known.get(name)
        if place is None or place.status != "resolved":
            # Not silently dropped: a map missing a third of the reporting
            # without saying so is worse than one that reports the gap.
            unresolved.append(name)
            unresolved_events += len(events)
            continue
        key = place.qid or f"{place.latitude:.4f},{place.longitude:.4f}"
        point = merged.setdefault(
            key,
            {
                # The article's own words, but the fullest of them: "จังหวัด
                # กาฬสินธุ์" tells a reader more than "กาฬสินธุ์".
                "name": name,
                "label": place.label,
                "latitude": place.latitude,
                "longitude": place.longitude,
                "qid": place.qid,
                "count": 0,
                "events": [],
            },
        )
        if len(name) > len(point["name"]):
            point["name"] = name
        point["count"] += len(events)
        point["events"].extend(events)

    points = list(merged.values())
    for point in points:
        point["events"].sort(
            key=lambda e: (e["when"] is not None, e["when"] or ""), reverse=True
        )
    points.sort(key=lambda p: p["count"], reverse=True)
    return {
        "points": points,
        "unresolved": sorted(unresolved),
        "unresolved_events": unresolved_events,
    }


async def resolve_pending(db: AsyncSession, limit: int = 40) -> dict[str, int]:
    """Geocode place names that have appeared in signals but have no point yet.

    Deliberately a separate pass rather than part of intake: this is a network
    round trip to a free API that asks callers to keep the rate modest, and it
    must not sit on the path a signal takes to reaching an analyst.
    """
    from ..signals.models import ExternalSignal

    signals = (await db.execute(select(ExternalSignal))).scalars().all()
    names = {
        (event.get("location") or "").strip()
        for signal in signals
        for event in (signal.payload or {}).get("top_events") or []
        if (event.get("location") or "").strip()
    }
    known = {
        p.name
        for p in (
            await db.execute(select(Place).where(Place.status != "pending"))
        ).scalars()
    }
    todo = sorted(names - known)[:limit]

    counts = {"asked": 0, "resolved": 0, "no_match": 0}
    if not todo:
        return counts
    async with httpx.AsyncClient() as client:
        for name in todo:
            place = await resolve(db, name, client=client)
            counts["asked"] += 1
            if place.status in counts:
                counts[place.status] += 1
    log.info("geocoding pass complete", extra=counts)
    return counts
