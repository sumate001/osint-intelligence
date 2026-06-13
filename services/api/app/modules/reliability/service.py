"""
NATO Admiralty Code — source reliability × information credibility
Source:  A (Completely reliable) → F (Cannot be judged)
Info:    1 (Confirmed)           → 6 (Cannot be judged)
"""

from ...models.source import Source
from ...adapters.base import CanonicalFeedItem

# Thresholds for auto-adjusting source reliability based on track record
_RELIABILITY_THRESHOLDS = {
    "A": 0.95,  # >=95% success rate → A
    "B": 0.85,
    "C": 0.70,
    "D": 0.50,
    "E": 0.0,
}

# Map source_type → default info credibility
_SOURCE_TYPE_INFO_CODES = {
    "rss": "3",        # Possibly true (public RSS, unverified)
    "wire": "2",       # Probably true (wire services generally reliable)
    "social": "4",     # Doubtfully true (social media)
    "cms": "2",        # Probably true (internal CMS)
    "messaging": "5",  # Improbable
    "webhook": "3",    # Possibly true
}


def _auto_source_code(source: Source) -> str:
    """Derive source reliability code from track record."""
    # Admin can override via admiralty_source_code
    if source.admiralty_source_code and source.admiralty_source_code != "C":
        return source.admiralty_source_code

    total = source.success_count + source.error_count
    if total < 10:
        return source.admiralty_source_code or "C"

    rate = source.success_count / total
    for code, threshold in _RELIABILITY_THRESHOLDS.items():
        if rate >= threshold:
            return code
    return "F"


def assign_admiralty(source: Source, item: CanonicalFeedItem) -> dict:
    """Assign Admiralty source × info codes for an ingested item."""
    source_code = _auto_source_code(source)
    info_code = _SOURCE_TYPE_INFO_CODES.get(item.source_type.value, "3")

    # Verified sources always get info code 1 or 2
    if item.verified_source:
        info_code = "1" if source_code in ("A", "B") else "2"

    return {
        "source_code": source_code,
        "info_code": info_code,
        "label": f"{source_code}{info_code}",
    }


SOURCE_CODE_LABELS = {
    "A": "Completely reliable",
    "B": "Usually reliable",
    "C": "Fairly reliable",
    "D": "Not usually reliable",
    "E": "Unreliable",
    "F": "Cannot be judged",
}

INFO_CODE_LABELS = {
    "1": "Confirmed by other sources",
    "2": "Probably true",
    "3": "Possibly true",
    "4": "Doubtfully true",
    "5": "Improbable",
    "6": "Cannot be judged",
}
