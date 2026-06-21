import json
import logging
from datetime import datetime, timezone

from ...core.llm import chat_json
from ...adapters.base import CanonicalFeedItem
from .schemas import TriageScores, Verdict

logger = logging.getLogger(__name__)

TRIAGE_PROMPT = """คุณเป็นนักวิเคราะห์ข่าวกรองอาวุโสของห้องข่าว ให้คะแนนข่าวชิ้นนี้ตามเกณฑ์ 7 ข้อ (0-10 แต่ละข้อ):

1. relevance — ความเกี่ยวข้องกับประเด็นที่ห้องข่าวติดตาม
2. urgency — ความเร่งด่วน ต้องดำเนินการเร็วแค่ไหน
3. impact — ผลกระทบต่อสังคม/เศรษฐกิจ/การเมือง
4. novelty — ความใหม่ของข้อมูล ไม่ใช่ซ้ำกับที่รู้แล้ว
5. reliability — ความน่าเชื่อถือของแหล่งข้อมูล
6. sensitivity — ความอ่อนไหว/เสี่ยงต่อการเผยแพร่ก่อนยืนยัน
7. actionability — มีสิ่งที่ห้องข่าวทำได้ทันทีหรือไม่

คำนวณ total = (relevance + urgency + impact + novelty + reliability + actionability) / 6 * (1 + sensitivity*0.1)

กำหนด verdict:
- PRIORITY: total >= 7.5 หรือ urgency >= 9
- INVESTIGATE: total >= 5.5
- FAST_TRACK: impact >= 8 และ reliability >= 7
- PASS: อื่นๆ

สกัด entities ที่พบ: persons, organizations, locations, events (list of strings แต่ละประเภท)

ตอบเป็น JSON เท่านั้น:
{
  "relevance": <0-10>,
  "urgency": <0-10>,
  "impact": <0-10>,
  "novelty": <0-10>,
  "reliability": <0-10>,
  "sensitivity": <0-10>,
  "actionability": <0-10>,
  "total": <0-10>,
  "verdict": "PRIORITY|INVESTIGATE|FAST_TRACK|PASS",
  "verdict_reason": "<อธิบาย 1-2 ประโยค>",
  "entities": {
    "persons": [],
    "organizations": [],
    "locations": [],
    "events": []
  }
}"""


def _determine_verdict(scores: dict) -> Verdict:
    total = scores["total"]
    urgency = scores["urgency"]
    impact = scores["impact"]
    reliability = scores["reliability"]

    if total >= 7.5 or urgency >= 9:
        return "PRIORITY"
    if impact >= 8 and reliability >= 7:
        return "FAST_TRACK"
    if total >= 5.5:
        return "INVESTIGATE"
    return "PASS"


def _calculate_total(scores: dict) -> float:
    keys = ["relevance", "urgency", "impact", "novelty", "reliability", "actionability"]
    base = sum(scores.get(k, 0) for k in keys) / 6
    sensitivity_bonus = 1 + scores.get("sensitivity", 0) * 0.1
    return round(min(10.0, base * sensitivity_bonus), 2)


async def score_item(item: CanonicalFeedItem) -> TriageScores:
    """Run LLM triage scoring on a CanonicalFeedItem."""
    messages = [
        {"role": "system", "content": TRIAGE_PROMPT},
        {
            "role": "user",
            "content": f"หัวข้อ: {item.title}\n\nเนื้อหา: {item.body[:2000]}\n\nแหล่งที่มา: {item.source_id} (weight={item.source_weight}, verified={item.verified_source})",
        },
    ]

    try:
        from ..admin.service import get_effective_model
        model = await get_effective_model("triage")
        result = await chat_json(messages, module="triage", model=model)
    except Exception as e:
        logger.warning("LLM triage failed for %s: %s(%s) — using fallback scores", item.external_id, type(e).__name__, e)
        result = _fallback_scores(item)

    # Validate and normalise
    scores = {
        "relevance": float(result.get("relevance", 5)),
        "urgency": float(result.get("urgency", 3)),
        "impact": float(result.get("impact", 5)),
        "novelty": float(result.get("novelty", 5)),
        "reliability": float(result.get("reliability", 5)) * float(item.source_weight),
        "sensitivity": float(result.get("sensitivity", 3)),
        "actionability": float(result.get("actionability", 5)),
    }
    # clamp to 0-10
    scores = {k: max(0.0, min(10.0, v)) for k, v in scores.items()}
    scores["total"] = _calculate_total(scores)

    verdict = _determine_verdict(scores)

    return TriageScores(
        **scores,
        verdict=verdict,
        verdict_reason=result.get("verdict_reason", ""),
        entities=result.get("entities", {}),
    )


def _fallback_scores(item: CanonicalFeedItem) -> dict:
    """Rule-based fallback when LLM is unavailable."""
    weight = item.source_weight
    base = 5.0 * weight
    return {
        "relevance": base,
        "urgency": 3.0,
        "impact": base,
        "novelty": 5.0,
        "reliability": 5.0 * weight,
        "sensitivity": 3.0,
        "actionability": base,
        "total": base,
        "verdict": "INVESTIGATE" if weight > 1.0 else "PASS",
        "verdict_reason": "Fallback scoring (LLM unavailable)",
        "entities": {},
    }
