import asyncio
import logging
import uuid

from ...worker import celery_app

logger = logging.getLogger(__name__)


# ─── EEI generation ──────────────────────────────────────────────────────────

@celery_app.task(
    name="requirements.generate_eei",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    acks_late=True,
    queue="intel",
)
def generate_eei_task(self, pir_id: str):
    """LLM generates 3-5 EEI sub-questions for a newly created PIR."""
    try:
        asyncio.run(_generate_eei(pir_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


async def _generate_eei(pir_id: str) -> None:
    from sqlalchemy import select, update
    from sqlalchemy.orm.attributes import flag_modified
    from ...core.llm import chat_json
    from .models import PIR
    from datetime import datetime, timezone

    AsyncSessionLocal = _make_celery_session()
    async with AsyncSessionLocal() as db:
        pir = (await db.execute(select(PIR).where(PIR.id == pir_id))).scalar_one_or_none()
        if not pir or pir.eei_list:
            return  # already has EEIs or not found

        messages = [
            {
                "role": "system",
                "content": (
                    "คุณเป็น intelligence analyst อาวุโส "
                    "หน้าที่คือแตก Priority Intelligence Requirement (PIR) ออกเป็น Essential Elements of Information (EEI) "
                    "ซึ่งเป็นคำถามย่อยที่ต้องหาคำตอบเพื่อตอบ PIR ได้ครบ\n\n"
                    "กฎ:\n"
                    "- สร้าง 3-5 EEI ที่ครอบคลุม PIR ได้ครบ\n"
                    "- แต่ละ EEI ต้องเป็นคำถามที่ตอบได้จากข้อมูลภายนอก (ข่าว เอกสาร หลักฐาน)\n"
                    "- คำถามต้องชัดเจน เฉพาะเจาะจง ไม่ซ้ำกัน\n"
                    "- ตอบเป็น JSON เท่านั้น: {\"eeis\": [\"คำถาม 1\", \"คำถาม 2\", ...]}"
                ),
            },
            {
                "role": "user",
                "content": f"PIR: {pir.question}",
            },
        ]

        try:
            from ..admin.service import get_effective_model
            effective_model = await get_effective_model("requirements")
            result = await chat_json(messages, module="requirements", model=effective_model)
            questions = result.get("eeis", [])
            if not isinstance(questions, list) or not questions:
                logger.warning("generate_eei: LLM returned no EEIs for PIR %s", pir_id)
                return

            new_eeis = [
                {"id": str(uuid.uuid4()), "question": q, "answered": False, "answer": None}
                for q in questions[:5]
                if isinstance(q, str) and q.strip()
            ]
            await db.execute(
                update(PIR).where(PIR.id == pir_id).values(
                    eei_list=new_eeis,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            logger.info("generate_eei: created %d EEIs for PIR %s", len(pir.eei_list), pir_id)

            # Immediately search for answers proactively
            search_eei_task.delay(pir_id)
        except Exception as exc:
            logger.warning("generate_eei: failed for PIR %s: %s — %s", pir_id, type(exc).__name__, exc)
            raise  # let Celery retry


# ─── PIR matching ─────────────────────────────────────────────────────────────

@celery_app.task(
    name="requirements.match_pir",
    bind=True,
    max_retries=1,
    default_retry_delay=30,
    acks_late=True,
    queue="intel",
    time_limit=60,
    soft_time_limit=50,
)
def match_pir_task(self, title: str, body: str, source: str = "unknown"):
    """Match text content against active PIRs with unanswered EEIs."""
    asyncio.run(_match_pir(title, body, source))


async def _match_pir(title: str, body: str, source: str) -> None:
    from . import service

    if not title and not body:
        return

    AsyncSessionLocal = _make_celery_session()
    async with AsyncSessionLocal() as db:
        updated = await service.match_feed_item_to_pirs(
            db,
            feed_item_id=f"{source}:{title[:60]}",
            title=title,
            body=body,
        )
        if updated:
            await db.commit()
            logger.info("match_pir [%s]: updated PIRs %s", source, updated)


# ─── Proactive EEI search ─────────────────────────────────────────────────────

@celery_app.task(
    name="requirements.search_eei",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
    acks_late=True,
    queue="intel",
)
def search_eei_task(self, pir_id: str):
    """Use Perplexica deep research to answer each unanswered EEI directly."""
    asyncio.run(_search_eei(pir_id))


async def _search_eei(pir_id: str) -> None:
    import httpx
    from sqlalchemy import select, update
    from datetime import datetime, timezone
    from ...core.config import get_settings
    from .models import PIR

    settings = get_settings()
    perplexica_url = settings.perplexica_url.rstrip("/")

    AsyncSessionLocal = _make_celery_session()
    async with AsyncSessionLocal() as db:
        pir = (await db.execute(select(PIR).where(PIR.id == pir_id))).scalar_one_or_none()
        if not pir:
            return
        unanswered = [e for e in (pir.eei_list or []) if not e.get("answered")]

    if not unanswered:
        return

    logger.info("search_eei: querying Perplexica for PIR %s (%d EEIs)", pir_id, len(unanswered))

    from ..admin.service import get_effective_model
    effective_model = await get_effective_model("requirements")

    payload_base = {
        "sources": [{"type": "web"}],
        "optimizationMode": "quality",  # deep research — uses Playwright full-page scraping
        "chatModel": {"providerId": "ollama-local", "key": effective_model},
        "embeddingModel": {
            "providerId": "a07fbfdd-1a9b-40f6-b729-92150936de0a",
            "key": "Xenova/nomic-embed-text-v1",
        },
        "stream": False,
    }

    updated_eeis = list(pir.eei_list)
    any_answered = False

    async with httpx.AsyncClient(timeout=300) as client:
        for i, eei in enumerate(unanswered):
            query = f"{eei['question']} (บริบท: {pir.question[:100]})"
            try:
                resp = await client.post(
                    f"{perplexica_url}/api/search",
                    json={**payload_base, "query": query},
                )
                if resp.status_code != 200:
                    logger.warning("search_eei: Perplexica %d for EEI %s", resp.status_code, eei["id"])
                    continue

                answer = resp.json().get("message", "").strip()
                if not answer or len(answer) < 30:
                    logger.info("search_eei: no useful answer for EEI %s", eei["id"])
                    continue

                # Use Perplexica's synthesized answer directly as EEI answer
                for j, e in enumerate(updated_eeis):
                    if e["id"] == eei["id"]:
                        updated_eeis[j] = {**e, "answered": True, "answer": answer[:1500]}
                        any_answered = True
                        logger.info("search_eei: answered EEI %s via Perplexica", eei["id"])
                        break

            except Exception as exc:
                logger.warning("search_eei: Perplexica failed for EEI %s: %s", eei["id"], exc)

    if any_answered:
        all_done = all(e.get("answered") for e in updated_eeis)
        AsyncSessionLocal2 = _make_celery_session()
        async with AsyncSessionLocal2() as db:
            values: dict = {"eei_list": updated_eeis, "updated_at": datetime.now(timezone.utc)}
            if all_done:
                values["status"] = "ANSWERED"
            await db.execute(update(PIR).where(PIR.id == pir_id).values(**values))
            await db.commit()
            logger.info("search_eei: saved EEI answers for PIR %s", pir_id)


# ─── Shared ───────────────────────────────────────────────────────────────────

def _make_celery_session():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from ...core.config import get_settings
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
