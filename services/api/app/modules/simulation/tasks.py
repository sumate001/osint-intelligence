"""Celery task: run MiroFish simulation."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx

from ...worker import celery_app
from ...core.config import get_settings

log = logging.getLogger(__name__)

STEPS = [
    "สกัด ontology จาก seed",
    "สร้าง knowledge graph (Neo4j)",
    "สร้าง agents",
    "รัน simulation",
    "ReportAgent วิเคราะห์ผล",
]


def _session():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="simulation.run", bind=True, max_retries=2)
def run_simulation(self, job_id: str) -> None:
    try:
        asyncio.run(_run(job_id))
    except Exception as exc:
        log.error("Simulation task failed for job %s: %s", job_id, exc)
        try:
            asyncio.run(_mark_failed_sync(job_id, f"Worker error: {exc}"))
        except Exception as e:
            log.error("Cleanup after failure also failed for job %s: %s", job_id, e)


async def _mark_failed_sync(job_id: str, reason: str) -> None:
    from .models import SimulationJob
    from sqlalchemy import select
    SessionLocal = _session()
    async with SessionLocal() as db:
        job = (await db.execute(
            select(SimulationJob).where(SimulationJob.id == job_id)
        )).scalar_one_or_none()
        if job and job.status in ("RUNNING", "PENDING"):
            job.status = "FAILED"
            job.error = reason
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _run(job_id: str) -> None:
    from .models import SimulationJob
    from sqlalchemy import select

    SessionLocal = _session()
    settings = get_settings()

    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if not job:
            return
        job.status = "RUNNING"
        job.progress_step = 1
        await db.commit()

    mirofish_url = getattr(settings, "mirofish_url", None) or ""

    try:
        if mirofish_url:
            await _run_mirofish(job_id, mirofish_url, SessionLocal)
        else:
            await _run_llm_fallback(job_id, settings, SessionLocal)
    except Exception as exc:
        log.error("Simulation failed: %s", exc)
        async with SessionLocal() as db:
            job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
            if job:
                job.status = "FAILED"
                job.error = str(exc)
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()


async def _set_step(job_id: str, step: int, SessionLocal) -> None:
    from .models import SimulationJob
    from sqlalchemy import select
    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if job:
            job.progress_step = step
            await db.commit()


async def _run_mirofish(job_id: str, url: str, SessionLocal) -> None:
    from .models import SimulationJob
    from sqlalchemy import select

    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if not job:
            return
        config = job.config
        seed = job.seed_data

    for step in range(1, 6):
        await _set_step(job_id, step, SessionLocal)
        await asyncio.sleep(5)

    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(f"{url}/simulate", json={"config": config, "seed": seed})
        resp.raise_for_status()
        result = resp.json()

    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if job:
            job.status = "DONE"
            job.result = result
            job.progress_step = 5
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _run_llm_fallback(job_id: str, settings, SessionLocal) -> None:
    """LLM-only fallback when MiroFish is not configured."""
    from .models import SimulationJob
    from sqlalchemy import select
    from ...core.llm import chat_json

    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if not job:
            return
        config = job.config
        seed = job.seed_data

    for step in range(1, 5):
        await _set_step(job_id, step, SessionLocal)
        await asyncio.sleep(3)

    case_title = seed.get("case_title", "") if seed else ""
    case_desc = seed.get("case_description", "") if seed else ""
    findings = seed.get("verified_findings", []) if seed else []
    entities = seed.get("entities", []) if seed else []
    findings_text = "\n".join(f"- {f.get('title','')}: {str(f.get('content',''))[:200]}" for f in findings[:5]) or "(ไม่มี verified findings)"
    entities_text = ", ".join(str(e.get("label", "")) for e in entities[:10]) or "(ไม่มี entities)"

    messages = [
        {"role": "system", "content": "คุณคือ MiroFish Swarm Intelligence Engine ที่จำลองผลกระทบของเหตุการณ์ข่าว ตอบเป็น JSON เท่านั้น"},
        {"role": "user", "content": f"""เรื่องที่สืบสวน: {case_title}
รายละเอียด: {case_desc}

Verified Findings:
{findings_text}

Entities: {entities_text}
Config: agents={config.get('agents', 1000)}, timeframe={config.get('timeframe', 30)}d

สร้าง Impact Assessment JSON:
{{"confidence":"MEDIUM","scenarios":[{{"type":"BEST","label":"...","probability":25,"timeline_weeks":"2-4","bullets":["..."]}},{{"type":"BASE","label":"...","probability":55,"timeline_weeks":"4-8","bullets":["..."]}},{{"type":"WORST","label":"...","probability":20,"timeline_weeks":"1-3","bullets":["..."]}}],"signals":[{{"icon":"📊","description":"...","priority":"HIGH"}}],"timeline":[{{"day":"D+0","description":"..."}},{{"day":"D+7","description":"..."}},{{"day":"D+30","description":"..."}}],"pivot_points":[{{"condition":"ถ้า...","consequence":"→ ...","type":"KEY"}}],"coverage_strategy":"..."}}"""},
    ]

    try:
        result = await chat_json(messages, module="simulation")
    except Exception as exc:
        log.error("Simulation LLM call failed for job %s: %s", job_id, exc)
        result = {"confidence": "LOW", "scenarios": [], "signals": [], "timeline": [], "pivot_points": [], "coverage_strategy": "ไม่สามารถวิเคราะห์ได้ — LLM error: " + str(exc)[:200]}

    await _set_step(job_id, 5, SessionLocal)
    async with SessionLocal() as db:
        job = (await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))).scalar_one_or_none()
        if job:
            job.status = "DONE"
            job.result = result
            job.progress_step = 5
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
