"""Celery tasks: run full verification pipeline on uploaded media."""
import asyncio
import base64
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from ...worker import celery_app
from ...core.config import get_settings
from .service import (
    extract_exif_from_bytes,
    extract_gps,
    extract_audio_bytes,
    get_video_duration,
    parse_whisper_transcript,
    extract_frame_at,
    extract_evenly_spaced_frames,
    check_wayback,
    reverse_image_search,
    determine_verdict,
)

log = logging.getLogger(__name__)

MAX_SHOTS = 5  # max frames to extract per video


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
    from ...core.llm import transcribe_audio, analyze_image_b64, chat_completion as llm_chat

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
        # ── 1. Download from MinIO ─────────────────────────────────────────────
        file_bytes = b""
        try:
            minio_endpoint = getattr(settings, "minio_endpoint", "") or ""
            minio_user = getattr(settings, "minio_user", "") or ""
            minio_password = getattr(settings, "minio_password", "") or ""
            if minio_endpoint and job.minio_key:
                def _dl():
                    from minio import Minio
                    bucket, *kparts = job.minio_key.split("/", 1)
                    obj_key = kparts[0] if kparts else job.minio_key
                    c = Minio(minio_endpoint, access_key=minio_user, secret_key=minio_password, secure=False)
                    return c.get_object(bucket, obj_key).read()
                file_bytes = await asyncio.to_thread(_dl)
                log.info("Downloaded %d bytes from MinIO for job %s", len(file_bytes), job_id)
        except Exception as exc:
            log.warning("MinIO download failed: %s", exc)

        # ── 2. EXIF ────────────────────────────────────────────────────────────
        exif_data: dict = {}
        gps_lat = gps_lon = gps_ts = None
        camera_make = camera_model = None
        if file_bytes:
            exif_data = extract_exif_from_bytes(file_bytes, job.filename)
            gps_lat, gps_lon, gps_ts = extract_gps(exif_data)
            camera_make = exif_data.get("Make")
            camera_model = exif_data.get("Model")

        # ── 3. Transcribe ──────────────────────────────────────────────────────
        transcript: str | None = None          # clean text shown to analyst
        transcript_segments: list[tuple[float, str]] = []  # (seconds, text)

        if job.file_type in ("video", "audio") and file_bytes:
            audio = extract_audio_bytes(file_bytes) if job.file_type == "video" else file_bytes
            if audio:
                log.info("Transcribing %d bytes for job %s", len(audio), job_id)
                raw = await transcribe_audio(audio)
                if raw:
                    transcript_segments = parse_whisper_transcript(raw)
                    if transcript_segments:
                        # Store clean text (no timestamp markers) in transcript field
                        transcript = " ".join(t for _, t in transcript_segments)
                        log.info("Parsed %d segments with timestamps for job %s",
                                 len(transcript_segments), job_id)
                    else:
                        transcript = raw  # no timestamps — store as-is
                        log.info("Transcript (no timestamps) for job %s", job_id)

        # ── 4. Shot selection + frame analysis (video only) ───────────────────
        # KeyframeAnalysis: list of {ts, transcript_context, description}
        keyframe_analysis: list[dict] = []

        if job.file_type == "video" and file_bytes:
            duration = await asyncio.to_thread(get_video_duration, file_bytes)
            log.info("Video duration %.1fs for job %s", duration, job_id)

            target_timestamps: list[float] = []

            if transcript_segments:
                # Ask LLM which moments are worth capturing (person, location, event)
                ts_lines = "\n".join(
                    f"[{ts:.1f}s] {text}" for ts, text in transcript_segments[:120]
                )
                shot_prompt = (
                    f"คุณเป็นบรรณาธิการภาพข่าว วิดีโอความยาว {duration:.0f} วินาที "
                    f"มี transcript ด้านล่าง เลือก {MAX_SHOTS} timestamp (วินาที) "
                    "ที่ควรจับภาพเพื่อใช้ในการรายงานข่าว เน้น: บุคคลที่กำลังพูดหรือปรากฏตัว, "
                    "สถานที่สำคัญ, เหตุการณ์สำคัญ, ป้าย/ข้อความในภาพ "
                    "ตอบเป็น JSON array ของตัวเลขวินาที เท่านั้น ตัวอย่าง: [4.5, 18.2, 35.0]\n\n"
                    f"{ts_lines}"
                )
                try:
                    shot_result = await llm_chat(
                        [{"role": "user", "content": shot_prompt}],
                        module="default", timeout=60.0,
                    )
                    m = re.search(r'\[[\d.,\s]+\]', shot_result)
                    if m:
                        target_timestamps = [
                            float(x) for x in json.loads(m.group())
                            if 0 <= float(x) <= duration
                        ][:MAX_SHOTS]
                        log.info("LLM selected %d shots: %s", len(target_timestamps), target_timestamps)
                except Exception as exc:
                    log.warning("Shot selection failed, falling back to even sampling: %s", exc)

            from .service import upload_to_minio as _upload_frame

            if not target_timestamps:
                # No transcript or LLM failed — evenly-spaced fallback
                log.info("Using evenly-spaced frame sampling for job %s", job_id)
                pairs = await asyncio.to_thread(
                    extract_evenly_spaced_frames, file_bytes, duration, MAX_SHOTS
                )
                for ts, frame_bytes in pairs:
                    frame_b64 = base64.b64encode(frame_bytes).decode()
                    desc = await analyze_image_b64(
                        frame_b64,
                        "อธิบายสิ่งที่เห็นในภาพอย่างละเอียด: บุคคล สถานที่ กิจกรรม "
                        "ป้ายหรือข้อความ และสิ่งผิดปกติที่อาจบ่งชี้การตัดต่อ",
                    )
                    if desc:
                        idx = len(keyframe_analysis)
                        minio_key = f"verify/{job_id}/frame_{idx}.jpg"
                        await _upload_frame(frame_bytes, minio_key, "image/jpeg")
                        keyframe_analysis.append({
                            "ts": ts,
                            "description": desc,
                            "transcript_context": "",
                            "minio_key": minio_key,
                        })
            else:
                # Extract and describe frames at LLM-selected timestamps
                for ts in target_timestamps:
                    frame_bytes = await asyncio.to_thread(extract_frame_at, file_bytes, ts)
                    if not frame_bytes:
                        log.warning("No frame at %.1fs for job %s", ts, job_id)
                        continue

                    # Find transcript text closest to this timestamp
                    ctx = ""
                    if transcript_segments:
                        closest = min(transcript_segments, key=lambda s: abs(s[0] - ts))
                        ctx = closest[1]

                    frame_b64 = base64.b64encode(frame_bytes).decode()
                    desc = await analyze_image_b64(
                        frame_b64,
                        "อธิบายสิ่งที่เห็นในภาพอย่างละเอียด: บุคคล (ลักษณะ เพศ วัย เสื้อผ้า), "
                        "สถานที่ สภาพแวดล้อม กิจกรรม ป้ายหรือข้อความที่เห็น "
                        "และสิ่งผิดปกติที่อาจบ่งชี้การตัดต่อหรือ deepfake",
                    )
                    if desc:
                        idx = len(keyframe_analysis)
                        minio_key = f"verify/{job_id}/frame_{idx}.jpg"
                        await _upload_frame(frame_bytes, minio_key, "image/jpeg")
                        keyframe_analysis.append({
                            "ts": round(ts, 1),
                            "description": desc,
                            "transcript_context": ctx,
                            "minio_key": minio_key,
                        })
                        log.info("Shot at %.1fs saved to MinIO for job %s", ts, job_id)

        # ── 5. Wayback Machine check ───────────────────────────────────────────
        source_url = exif_data.get("SourceURL") or exif_data.get("Comment", "")
        wb_url, wb_first_seen = None, None
        if source_url and str(source_url).startswith("http"):
            wb_url, wb_first_seen = await check_wayback(str(source_url))

        # ── 6. Reverse image search (images only) ─────────────────────────────
        duplicate_hits: list[dict] = []
        if job.file_type == "image" and file_bytes:
            duplicate_hits = await reverse_image_search(file_bytes, job.filename)

        # ── 7. Verdict (rule-based) ────────────────────────────────────────────
        verdict, rule_notes = determine_verdict(exif_data, gps_lat, wb_first_seen, len(duplicate_hits))

        # ── 8. Comprehensive media summary ────────────────────────────────────
        verdict_notes = rule_notes
        if transcript or keyframe_analysis:
            summary_parts: list[str] = []
            if transcript:
                summary_parts.append(f"ถอดเสียง:\n{transcript}")
            if keyframe_analysis:
                shot_lines_list = []
                for item in keyframe_analysis:
                    ctx = item["transcript_context"]
                    ctx_part = f'"{ctx}" → ' if ctx else ""
                    shot_lines_list.append(f"- [{item['ts']}s] {ctx_part}{item['description']}")
                shot_lines = "\n".join(shot_lines_list)
                summary_parts.append(f"ภาพในวิดีโอ:\n{shot_lines}")

            summary_prompt = (
                "คุณเป็นผู้ตรวจสอบสื่อในงานข่าว สรุปเนื้อหาวิดีโอนี้สำหรับบรรณาธิการ "
                "ระบุครบถ้วน: ใครปรากฏในภาพ / เกิดอะไรขึ้น / สถานที่และบริบท / "
                "ประเด็นที่ต้องตรวจสอบเพิ่มเติม ไม่ต้องย่อให้สั้นเกินไป:\n\n"
                + "\n\n".join(summary_parts)
            )
            try:
                media_summary = await llm_chat(
                    [{"role": "user", "content": summary_prompt}],
                    module="default", timeout=120.0,
                )
                verdict_notes = media_summary + "\n\n---\n" + rule_notes
                log.info("Media summary done for job %s", job_id)
            except Exception as exc:
                log.warning("Media summary failed: %s", exc)

        # ── 9. Save results ────────────────────────────────────────────────────
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
                if keyframe_analysis:
                    saved_exif["KeyframeAnalysis"] = keyframe_analysis
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
        log.error("Verify pipeline failed for %s: %s", job_id, exc, exc_info=True)
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
