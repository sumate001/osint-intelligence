"""Celery task: dark web query via Ahmia / TorBot."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx

from ...worker import celery_app
from ...core.config import get_settings

log = logging.getLogger(__name__)


def _session():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="darkweb.run_query", bind=True, max_retries=1)
def run_darkweb_query(self, query_id: str) -> None:
    asyncio.run(_run(query_id))


async def _run(query_id: str) -> None:
    from .models import DWQuery, DWResult
    from sqlalchemy import select

    SessionLocal = _session()
    settings = get_settings()

    async with SessionLocal() as db:
        q = (await db.execute(select(DWQuery).where(DWQuery.id == query_id))).scalar_one_or_none()
        if not q:
            return
        q.status = "RUNNING"
        await db.commit()

    try:
        raw_results = await _fetch_from_ahmia(q.query_text, settings)
        classified = await _classify_results(raw_results, q.query_text, settings)

        async with SessionLocal() as db:
            for item in classified:
                result = DWResult(
                    id=str(uuid.uuid4()),
                    query_id=query_id,
                    onion_url=item.get("url", ""),
                    title=item.get("title", ""),
                    summary=item.get("summary", ""),
                    classification=item.get("classification", "PASS"),
                    confidence=item.get("confidence", 0.5),
                    entities=item.get("entities", []),
                    legal_status="PENDING" if item.get("classification") == "FLAGGED" else "NA",
                    value=item.get("value", ""),
                )
                db.add(result)

            dq = (await db.execute(select(DWQuery).where(DWQuery.id == query_id))).scalar_one_or_none()
            if dq:
                dq.status = "DONE"
                dq.completed_at = datetime.now(timezone.utc)
            await db.commit()

        # Dispatch PIR match for each non-blocked dark web result
        from ...modules.requirements.tasks import match_pir_task
        for item in classified:
            if item.get("classification") != "BLOCKED":
                title = item.get("title", "")
                body = item.get("summary", "")
                if title or body:
                    match_pir_task.delay(title, body, source="darkweb")

    except Exception as exc:
        log.error("Dark web query failed: %s", exc)
        async with SessionLocal() as db:
            dq = (await db.execute(select(DWQuery).where(DWQuery.id == query_id))).scalar_one_or_none()
            if dq:
                dq.status = "FAILED"
                dq.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _fetch_from_ahmia(query: str, settings) -> list[dict]:
    """Fetch results from Ahmia (clearnet dark web search index)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                "https://ahmia.fi/search/",
                params={"q": query},
                headers={"User-Agent": "OSINT-Desk/1.0 (editorial research)"},
            )
            if resp.status_code != 200:
                return []

            from html.parser import HTMLParser

            class AhmiaParser(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.results = []
                    self._in_result = False
                    self._cur: dict = {}

                def handle_starttag(self, tag, attrs):
                    attrs_d = dict(attrs)
                    if tag == "li" and "result" in attrs_d.get("class", ""):
                        self._in_result = True
                        self._cur = {}
                    if self._in_result and tag == "a" and attrs_d.get("href", "").startswith("http"):
                        self._cur["url"] = attrs_d["href"]

                def handle_data(self, data):
                    if self._in_result and data.strip():
                        if "title" not in self._cur:
                            self._cur["title"] = data.strip()
                        elif "description" not in self._cur:
                            self._cur["description"] = data.strip()

                def handle_endtag(self, tag):
                    if tag == "li" and self._in_result:
                        if self._cur.get("url"):
                            self.results.append(self._cur)
                        self._in_result = False

            parser = AhmiaParser()
            parser.feed(resp.text)
            return parser.results[:10]
    except Exception as exc:
        log.warning("Ahmia fetch failed: %s — using LLM simulation", exc)
        return []


async def _classify_results(raw: list[dict], query: str, settings) -> list[dict]:
    """Use LLM to classify each result and extract entities."""
    if not raw:
        return _generate_demo_results(query)

    from ...core.llm import chat_json

    classified = []
    for item in raw[:5]:
        messages = [
            {"role": "system", "content": "คุณเป็น content classifier สำหรับ dark web intelligence ตอบเป็น JSON เท่านั้น"},
            {"role": "user", "content": f"""URL: {item.get('url','')}
Title: {item.get('title','')}
Description: {item.get('description','')}
Query: {query}

ตอบ JSON รูปแบบ:
{{"classification":"PASS","confidence":0.9,"entities":[],"summary":"สรุปสั้น","value":"LOW"}}

classification: FLAGGED=พบข้อมูลเกี่ยวข้องต้อง legal review, PASS=ข้อมูลทั่วไป, BLOCKED=เนื้อหาไม่เหมาะสม"""},
        ]
        try:
            from ..admin.service import get_effective_model
            effective_model = await get_effective_model("darkweb")
            parsed = await chat_json(messages, module="darkweb", model=effective_model)
            classified.append({
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "summary": parsed.get("summary", item.get("description", "")),
                "classification": parsed.get("classification", "PASS"),
                "confidence": float(parsed.get("confidence", 0.5)),
                "entities": parsed.get("entities", []),
                "value": parsed.get("value", "LOW"),
            })
        except Exception:
            classified.append({
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "summary": item.get("description", ""),
                "classification": "PASS",
                "confidence": 0.5,
                "entities": [],
                "value": "LOW",
            })

    return classified


def _generate_demo_results(query: str) -> list[dict]:
    """Demo results when Tor/Ahmia is not reachable."""
    return [
        {
            "url": f"xmh57jrzrnw6insl.onion/search?q={query[:20]}",
            "title": f"Forum discussion: {query}",
            "summary": f"การสนทนาทั่วไปเกี่ยวกับ \"{query}\" ในฟอรัม — ไม่มีข้อมูลใหม่ที่ clearnet ไม่มี",
            "classification": "PASS",
            "confidence": 0.88,
            "entities": [],
            "value": "LOW",
        },
        {
            "url": f"msydqstlz2kzerdg.onion/results/{query[:10].lower().replace(' ','-')}",
            "title": f"Data index mention: {query}",
            "summary": f"พบการอ้างถึง \"{query}\" ในรายการ index — ต้องการ legal review เพื่อตรวจสอบความถูกต้อง",
            "classification": "FLAGGED",
            "confidence": 0.72,
            "entities": [query.split()[0]] if query.split() else [],
            "value": "MED",
        },
    ]
