"""Unit tests for triage service — no DB, no LLM, mock everything."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.adapters.base import CanonicalFeedItem, SourceType
from app.modules.triage.service import (
    _determine_verdict,
    _calculate_total,
    _fallback_scores,
    score_item,
)


def _make_item(**kwargs) -> CanonicalFeedItem:
    defaults = dict(
        external_id="test-001",
        source_id="src-001",
        source_type=SourceType.RSS,
        title="ทดสอบข่าวสำคัญ",
        body="เนื้อหาข่าวทดสอบ",
        url="https://example.com/news/1",
        source_weight=1.0,
        verified_source=False,
        published_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return CanonicalFeedItem(**defaults)


# ── _determine_verdict ────────────────────────────────────────────────────────

def test_verdict_priority_by_total():
    scores = {"total": 8.0, "urgency": 5.0, "impact": 7.0, "reliability": 6.0}
    assert _determine_verdict(scores) == "PRIORITY"


def test_verdict_priority_by_urgency():
    scores = {"total": 5.0, "urgency": 9.5, "impact": 4.0, "reliability": 4.0}
    assert _determine_verdict(scores) == "PRIORITY"


def test_verdict_fast_track():
    scores = {"total": 6.0, "urgency": 5.0, "impact": 9.0, "reliability": 8.0}
    assert _determine_verdict(scores) == "FAST_TRACK"


def test_verdict_investigate():
    scores = {"total": 6.0, "urgency": 5.0, "impact": 5.0, "reliability": 5.0}
    assert _determine_verdict(scores) == "INVESTIGATE"


def test_verdict_pass():
    scores = {"total": 3.0, "urgency": 2.0, "impact": 3.0, "reliability": 3.0}
    assert _determine_verdict(scores) == "PASS"


# ── _calculate_total ──────────────────────────────────────────────────────────

def test_calculate_total_basic():
    scores = {
        "relevance": 5.0, "urgency": 5.0, "impact": 5.0,
        "novelty": 5.0, "reliability": 5.0, "actionability": 5.0,
        "sensitivity": 0.0,
    }
    result = _calculate_total(scores)
    assert result == pytest.approx(5.0, abs=0.01)


def test_calculate_total_sensitivity_bonus():
    scores = {
        "relevance": 5.0, "urgency": 5.0, "impact": 5.0,
        "novelty": 5.0, "reliability": 5.0, "actionability": 5.0,
        "sensitivity": 10.0,  # max bonus
    }
    result = _calculate_total(scores)
    assert result == pytest.approx(10.0, abs=0.01)  # clamped to 10


def test_calculate_total_capped_at_10():
    scores = {k: 10.0 for k in ["relevance", "urgency", "impact", "novelty", "reliability", "actionability"]}
    scores["sensitivity"] = 10.0
    assert _calculate_total(scores) == 10.0


# ── _fallback_scores ──────────────────────────────────────────────────────────

def test_fallback_scores_structure():
    item = _make_item(source_weight=1.5)
    result = _fallback_scores(item)
    assert "total" in result
    assert "verdict" in result
    assert result["verdict"] == "INVESTIGATE"  # weight > 1.0


def test_fallback_scores_low_weight():
    item = _make_item(source_weight=0.5)
    result = _fallback_scores(item)
    assert result["verdict"] == "PASS"


# ── score_item (with mocked LLM) ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_score_item_uses_llm():
    item = _make_item()
    mock_response = {
        "relevance": 7.0,
        "urgency": 8.0,
        "impact": 9.0,
        "novelty": 6.0,
        "reliability": 7.0,
        "sensitivity": 4.0,
        "actionability": 8.0,
        "total": 7.5,
        "verdict": "PRIORITY",
        "verdict_reason": "High urgency and impact",
        "entities": {"persons": ["นายก"], "organizations": [], "locations": [], "events": []},
    }
    with patch("app.modules.triage.service.chat_json", new=AsyncMock(return_value=mock_response)):
        result = await score_item(item)

    assert result.verdict == "PRIORITY"
    assert result.relevance == pytest.approx(7.0)
    assert result.entities["persons"] == ["นายก"]


@pytest.mark.asyncio
async def test_score_item_falls_back_on_llm_error():
    item = _make_item()
    with patch("app.modules.triage.service.chat_json", new=AsyncMock(side_effect=Exception("timeout"))):
        result = await score_item(item)

    assert result.verdict in ("PASS", "INVESTIGATE", "PRIORITY", "FAST_TRACK")
