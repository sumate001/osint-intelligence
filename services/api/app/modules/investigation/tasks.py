"""Celery tasks: SpiderFoot scan orchestration."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx

from ...worker import celery_app
from ...core.config import get_settings
from .neo4j import upsert_entities

log = logging.getLogger(__name__)


def _make_celery_session():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="investigation.run_spiderfoot_scan", bind=True, max_retries=3)
def run_spiderfoot_scan(self, scan_id: str) -> None:
    asyncio.run(_run_scan(scan_id))


async def _run_scan(scan_id: str) -> None:
    from .models import CaseScan
    from sqlalchemy import select

    SessionLocal = _make_celery_session()
    settings = get_settings()

    async with SessionLocal() as db:
        scan = (
            await db.execute(select(CaseScan).where(CaseScan.id == uuid.UUID(scan_id)))
        ).scalar_one_or_none()
        if not scan:
            return

        scan.status = "RUNNING"
        await db.commit()

        spiderfoot_url = getattr(settings, "spiderfoot_url", None) or ""
        if not spiderfoot_url:
            log.warning("SPIDERFOOT_URL not configured — scan %s stays RUNNING", scan_id)
            return

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # Create SpiderFoot scan
                resp = await client.post(
                    f"{spiderfoot_url}/scan/new",
                    data={
                        "scanname": f"case-{scan.case_id}-{scan_id[:8]}",
                        "scantarget": scan.target,
                        "usecase": "all",
                        "modulelist": "",
                        "typelist": "",
                    },
                )
                if resp.status_code != 200:
                    raise RuntimeError(f"SpiderFoot returned {resp.status_code}")

                sf_data = resp.json()
                sf_scan_id = sf_data.get("id") or sf_data.get("scanId", "")
                scan.external_id = sf_scan_id
                await db.commit()

            # Poll for completion (max 10 min), check DB for cancellation each tick
            for _ in range(60):
                await asyncio.sleep(10)

                # Check if cancelled via API
                async with SessionLocal() as db_check:
                    check = (
                        await db_check.execute(select(CaseScan).where(CaseScan.id == uuid.UUID(scan_id)))
                    ).scalar_one_or_none()
                    if check and check.status == "CANCELLED":
                        return

                async with httpx.AsyncClient(timeout=15) as client:
                    status_resp = await client.get(
                        f"{spiderfoot_url}/scan/{sf_scan_id}/status"
                    )
                    status_data = status_resp.json()
                    sf_status = status_data.get("status", "RUNNING")

                if sf_status in ("FINISHED", "ABORTED", "ERROR"):
                    break

            # Fetch results
            async with httpx.AsyncClient(timeout=30) as client:
                results_resp = await client.get(
                    f"{spiderfoot_url}/scan/{sf_scan_id}/results/all"
                )
                entities = results_resp.json() if results_resp.status_code == 200 else []

            async with SessionLocal() as db2:
                scan2 = (
                    await db2.execute(select(CaseScan).where(CaseScan.id == uuid.UUID(scan_id)))
                ).scalar_one_or_none()
                if scan2:
                    scan2.status = "DONE"
                    scan2.results = {"entities": entities}
                    scan2.completed_at = datetime.now(timezone.utc)
                    await db2.commit()

            # Push entities to Neo4j
            mapped = [
                {"type": e[4], "value": e[2], "source": "spiderfoot"}
                for e in entities
                if isinstance(e, list) and len(e) > 4
            ]
            await upsert_entities(str(scan.case_id), mapped)

        except Exception as exc:
            log.error("SpiderFoot scan failed: %s", exc)
            async with SessionLocal() as db3:
                scan3 = (
                    await db3.execute(select(CaseScan).where(CaseScan.id == uuid.UUID(scan_id)))
                ).scalar_one_or_none()
                if scan3:
                    scan3.status = "FAILED"
                    scan3.results = {"error": str(exc)}
                    scan3.completed_at = datetime.now(timezone.utc)
                    await db3.commit()
