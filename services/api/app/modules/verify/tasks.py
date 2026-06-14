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
    extract_audio_bytes,
    extract_keyframes,
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

        # 3. Video/audio: transcription + keyframe analysis
        transcript: str | None = None
        keyframe_descriptions: list[str] = []

        if job.file_type in ("video", "audio") and file_bytes:
            import base64
            from ...core.llm import transcribe_audio, analyze_image_b64

            # Extract audio and transcribe with Whisper via Ollama
            audio = extract_audio_bytes(file_bytes) if job.file_type == "video" else file_bytes
            if audio:
                log.info("Transcribing %s bytes of audio for job %s", len(audio), job_id)
                transcript = await transcribe_audio(audio)

            # Extract keyframes and describe with vision model
            if job.file_type == "video":
                frames = extract_keyframes(file_bytes, max_frames=5)
                log.info("Extracted %d keyframes for job %s", len(frames), job_id)
                for frame_bytes in frames:
                    frame_b64 = base64.b64encode(frame_bytes).decode()
                    desc = await analyze_image_b64(
                        frame_b64,
                        "อธิบายสิ่งที่เห็นในภาพนี้อย่างละเอียด "
                        "รวมถึงสถานที่ บุคคล กิจกรรม ป้ายหรือข้อความที่เห็น "
                        "และสิ่งผิดปกติใดๆ ที่บ่งชี้การแก้ไขหรือ deepfake",
                    )
                    keyframe_descriptions.append(desc)

        # 4. Wayback Machine check
        source_url = exif_data.get("SourceURL") or exif_data.get("Comment", "")
        wb_url, wb_first_seen = None, None
        if source_url and source_url.startswith("http"):
            wb_url, wb_first_seen = await check_wayback(source_url)

        # 5. Reverse image search (images only)
        duplicate_hits: list[dict] = []
        if job.file_type == "image" and file_bytes:
            duplicate_hits = await reverse_image_search(file_bytes, job.filename)

        # 6. Determine verdict
        verdict, verdict_notes = determine_verdict(exif_data, gps_lat, wb_first_seen, len(duplicate_hits))

        # Append video analysis summary to verdict notes
        if transcript:
            snippet = transcript[:300].replace("\n", " ")
            verdict_notes += f"\nถอดเสียง: {snippet}{'...' if len(transcript) > 300 else ''}"
        if keyframe_descriptions:
            verdict_notes += f"\nkeyframes ({len(keyframe_descriptions)} เฟรม): " + \
                " | ".join(d[:150] for d in keyframe_descriptions[:3])

        # 7. Save results
        async with SessionLocal() as db:
            job2 = (
                await db.execute(select(VerifyJob).where(VerifyJob.id == uuid.UUID(job_id)))
            ).scalar_one_or_none()
            if job2:
                job2.status = "DONE"
                saved_exif = {
                    k: str(v) for k, v in exif_data.items()
                    if k not in {"ThumbnailImage", "PreviewImage"}
                }
                if keyframe_descriptions:
                    saved_exif["KeyframeDescriptions"] = keyframe_descriptions
                job2.exif_data = saved_exif
                job2.gps_lat = gps_lat
                job2.gps_lon = gps_lon
                job2.gps_timestamp = gps_ts
                job2.camera_make = camera_make
                job2.camera_model = camera_model
                job2.wayback_url = wb_url
                job2.wayback_first_seen = wb_first_seen
                job2.duplicate_hits = duplicate_hits
                job2.transcript = transcript
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
