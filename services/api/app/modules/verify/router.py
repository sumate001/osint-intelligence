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
