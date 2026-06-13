"""Celery tasks: run full verification pipeline on uploaded media."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from ...worker import celery_app
from ...core.config import get_settings
from .service import (
    extract_exif_from_bytes,
    extract_gps,
    check_wayback,
    reverse_image_search,
    determine_verdict,
)

log = logging.getLogger(__name__)


def _make_celery_session():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="verify.run_pipeline", bind=True, max_retries=2)
def run_verify_pipeline(self, job_id: str) -> None:
    asyncio.run(_run_pipeline(job_id))


async def _run_pipeline(job_id: str) -> None:
    from .models import VerifyJob
    from sqlalchemy import select
    import httpx

    SessionLocal = _make_celery_session()
    settings = get_settings()

    async with SessionLocal() as db:
        job = (
            await db.execute(select(VerifyJob).where(VerifyJob.id == uuid.UUID(job_id)))
        ).scalar_one_or_none()
        if not job:
            return

        job.status = "PROCESSING"
        await db.commit()

    try:
        # 1. Download file from MinIO for analysis
        file_bytes = b""
        try:
            minio_endpoint = getattr(settings, "minio_endpoint", "") or ""
            minio_user = getattr(settings, "minio_user", "") or ""
            minio_password = getattr(settings, "minio_password", "") or ""
            if minio_endpoint and job.minio_key:
                bucket, *key_parts = job.minio_key.split("/", 1)
                key = key_parts[0] if key_parts else job.minio_key
                url = f"http://{minio_endpoint}/{bucket}/{key}"
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(url, auth=(minio_user, minio_password))
                    if resp.status_code == 200:
                        file_bytes = resp.content
        except Exception as exc:
            log.warning("Could not download file from MinIO: %s", exc)

        # 2. EXIF extraction
        exif_data = {}
        gps_lat = gps_lon = gps_ts = None
        camera_make = camera_model = None

        if file_bytes:
            exif_data = extract_exif_from_bytes(file_bytes, job.filename)
            gps_lat, gps_lon, gps_ts = extract_gps(exif_data)
            camera_make = exif_data.get("Make")
            camera_model = exif_data.get("Model")

        # 3. Wayback Machine check (use source URL if in metadata, else skip)
        source_url = exif_data.get("SourceURL") or exif_data.get("Comment", "")
        wb_url, wb_first_seen = None, None
        if source_url and source_url.startswith("http"):
            wb_url, wb_first_seen = await check_wayback(source_url)

        # 4. Reverse image search (images only)
        duplicate_hits: list[dict] = []
        if job.file_type == "image" and file_bytes:
            duplicate_hits = await reverse_image_search(file_bytes, job.filename)

        # 5. Determine verdict
        verdict, verdict_notes = determine_verdict(exif_data, gps_lat, wb_first_seen, len(duplicate_hits))

        # 6. Save results
        async with SessionLocal() as db:
            job2 = (
                await db.execute(select(VerifyJob).where(VerifyJob.id == uuid.UUID(job_id)))
            ).scalar_one_or_none()
            if job2:
                job2.status = "DONE"
                job2.exif_data = {
                    k: str(v) for k, v in exif_data.items()
                    if k not in {"ThumbnailImage", "PreviewImage"}
                }
                job2.gps_lat = gps_lat
                job2.gps_lon = gps_lon
                job2.gps_timestamp = gps_ts
                job2.camera_make = camera_make
                job2.camera_model = camera_model
                job2.wayback_url = wb_url
                job2.wayback_first_seen = wb_first_seen
                job2.duplicate_hits = duplicate_hits
                job2.verdict = verdict
                job2.verdict_notes = verdict_notes
                job2.completed_at = datetime.now(timezone.utc)
                await db.commit()

    except Exception as exc:
        log.error("Verify pipeline failed for %s: %s", job_id, exc)
        async with SessionLocal() as db:
            job3 = (
                await db.execute(select(VerifyJob).where(VerifyJob.id == uuid.UUID(job_id)))
            ).scalar_one_or_none()
            if job3:
                job3.status = "FAILED"
                job3.verdict = "UNVERIFIED"
                job3.verdict_notes = str(exc)
                job3.completed_at = datetime.now(timezone.utc)
                await db.commit()
