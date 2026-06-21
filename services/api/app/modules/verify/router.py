import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import select, func

from ...core.db import get_db
from ...core.auth import get_current_user
from .models import VerifyJob
from .schemas import VerifyJobOut, VerifyJobListOut
from .service import determine_file_type, upload_to_minio
from .tasks import run_verify_pipeline

router = APIRouter()


@router.post("/upload", response_model=VerifyJobOut, status_code=201)
async def upload_for_verify(
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")

    data = await file.read()
    if len(data) > 500 * 1024 * 1024:  # 500 MB
        raise HTTPException(status_code=413, detail="File too large (max 500 MB)")

    content_type = file.content_type or "application/octet-stream"
    file_type = determine_file_type(file.filename, content_type)

    job = VerifyJob(
        filename=file.filename,
        file_type=file_type,
        minio_key=f"verify/{uuid.uuid4()}/{file.filename}",
        file_size=len(data),
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Try to upload to MinIO (best-effort)
    await upload_to_minio(data, job.minio_key, content_type)

    # Trigger async verification
    run_verify_pipeline.delay(str(job.id))

    return job


@router.get("/jobs", response_model=VerifyJobListOut)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    q = select(VerifyJob).order_by(VerifyJob.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return VerifyJobListOut(items=list(rows), total=total)


@router.get("/jobs/{job_id}", response_model=VerifyJobOut)
async def get_job(
    job_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    job = (await db.execute(select(VerifyJob).where(VerifyJob.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs/{job_id}/media")
async def get_job_media(
    job_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Proxy the uploaded file from MinIO — used for thumbnails in the UI."""
    import asyncio
    import io
    from fastapi.responses import StreamingResponse

    job = (await db.execute(select(VerifyJob).where(VerifyJob.id == job_id))).scalar_one_or_none()
    if not job or not job.minio_key:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = get_settings()

    def _download():
        from minio import Minio
        bucket, *kparts = job.minio_key.split("/", 1)
        obj_key = kparts[0] if kparts else job.minio_key
        c = Minio(
            settings.minio_endpoint,
            access_key=getattr(settings, "minio_user", ""),
            secret_key=getattr(settings, "minio_password", ""),
            secure=False,
        )
        return c.get_object(bucket, obj_key).read()

    try:
        data = await asyncio.to_thread(_download)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")

    ext = job.filename.rsplit(".", 1)[-1].lower() if "." in job.filename else ""
    CT: dict[str, str] = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "gif": "image/gif", "webp": "image/webp", "tiff": "image/tiff", "bmp": "image/bmp",
        "mp4": "video/mp4", "mov": "video/quicktime", "avi": "video/x-msvideo",
        "mkv": "video/x-matroska", "webm": "video/webm",
        "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
        "ogg": "audio/ogg", "flac": "audio/flac",
    }
    content_type = CT.get(ext, "application/octet-stream")

    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/jobs/{job_id}/frames/{idx}")
async def get_job_frame(
    job_id: uuid.UUID,
    idx: int,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Serve a saved keyframe JPEG from MinIO."""
    import asyncio
    import io
    from fastapi.responses import StreamingResponse

    job = (await db.execute(select(VerifyJob).where(VerifyJob.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404)

    frames = (job.exif_data or {}).get("KeyframeAnalysis", [])
    if idx < 0 or idx >= len(frames) or not frames[idx].get("minio_key"):
        raise HTTPException(status_code=404, detail="Frame not stored")

    minio_key: str = frames[idx]["minio_key"]
    settings = get_settings()

    def _dl():
        from minio import Minio
        bucket, *kparts = minio_key.split("/", 1)
        obj_key = kparts[0] if kparts else minio_key
        c = Minio(
            settings.minio_endpoint,
            access_key=getattr(settings, "minio_user", ""),
            secret_key=getattr(settings, "minio_password", ""),
            secure=False,
        )
        return c.get_object(bucket, obj_key).read()

    try:
        data = await asyncio.to_thread(_dl)
    except Exception:
        raise HTTPException(status_code=404, detail="Frame not found in storage")

    return StreamingResponse(
        io.BytesIO(data),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Cancel a pending/processing job or delete a completed one."""
    from datetime import datetime, timezone
    job = (await db.execute(select(VerifyJob).where(VerifyJob.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.delete(job)
    await db.commit()
