import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import SimulationJob
from .schemas import SimCreate

STALE_AFTER_MINUTES = 30


async def create_job(db: AsyncSession, data: SimCreate, user_id: str) -> SimulationJob:
    job = SimulationJob(
        id=str(uuid.uuid4()),
        case_id=data.case_id,
        config=data.config.model_dump(),
        seed_data=data.seed_data,
        created_by=user_id,
    )
    db.add(job)
    await db.commit()  # commit before returning so Celery task can find the row
    await db.refresh(job)
    return job


async def get_job(db: AsyncSession, job_id: str) -> SimulationJob | None:
    return (
        await db.execute(select(SimulationJob).where(SimulationJob.id == job_id))
    ).scalar_one_or_none()


async def list_jobs(db: AsyncSession, case_id: str | None = None) -> list[SimulationJob]:
    # Expire jobs that are stuck in RUNNING/PENDING for longer than the stale threshold.
    # This handles Celery worker crashes where the failure callback never fired.
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_AFTER_MINUTES)
    await db.execute(
        update(SimulationJob)
        .where(
            SimulationJob.status.in_(["RUNNING", "PENDING"]),
            SimulationJob.created_at < stale_cutoff,
            SimulationJob.completed_at.is_(None),
        )
        .values(
            status="FAILED",
            error=f"งานหมดเวลา — worker หยุดทำงานระหว่างประมวลผล (stale after {STALE_AFTER_MINUTES}m)",
            completed_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    q = select(SimulationJob).order_by(SimulationJob.created_at.desc())
    if case_id:
        q = q.where(SimulationJob.case_id == case_id)
    return list((await db.execute(q)).scalars().all())


async def set_status(
    db: AsyncSession,
    job: SimulationJob,
    status: str,
    step: int | None = None,
    result: dict | None = None,
    error: str | None = None,
) -> SimulationJob:
    job.status = status
    if step is not None:
        job.progress_step = step
    if result is not None:
        job.result = result
    if error is not None:
        job.error = error
    if status in ("DONE", "FAILED"):
        job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(job)
    return job
