import uuid
from fastapi import APIRouter, Depends, HTTPException

from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import SimCreate, SimOut
from . import service
from .tasks import run_simulation

router = APIRouter()


@router.post("", response_model=SimOut, status_code=201)
async def start_simulation(
    data: SimCreate,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    job = await service.create_job(db, data, user_id=current_user["id"])
    run_simulation.delay(str(job.id))
    return job


@router.get("", response_model=list[SimOut])
async def list_simulations(
    case_id: str | None = None,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.list_jobs(db, case_id=case_id)


@router.get("/{job_id}", response_model=SimOut)
async def get_simulation(
    job_id: str,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    job = await service.get_job(db, job_id)
    if not job:
        raise HTTPException(404, "Simulation not found")
    return job
