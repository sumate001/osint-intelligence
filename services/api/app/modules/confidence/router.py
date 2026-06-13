from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import ConfidenceSet, ConfidenceOut, ACHCreate, ACHOut
from . import service

router = APIRouter()


@router.put("/{brief_id}/confidence", response_model=ConfidenceOut)
async def set_confidence(
    brief_id: str,
    body: ConfidenceSet,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    async with db.begin():
        record = await service.set_confidence(db, brief_id, body, current_user["id"])
    return ConfidenceOut.model_validate(record)


@router.get("/{brief_id}/confidence", response_model=ConfidenceOut | None)
async def get_confidence(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.get_confidence(db, brief_id)


@router.get("/{brief_id}/ach", response_model=list[ACHOut])
async def list_hypotheses(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    hyps = await service.list_hypotheses(db, brief_id)
    return [ACHOut.model_validate(h) for h in hyps]


@router.post("/{brief_id}/ach", response_model=ACHOut, status_code=201)
async def add_hypothesis(
    brief_id: str,
    body: ACHCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    async with db.begin():
        hyp = await service.add_hypothesis(db, brief_id, body, current_user["id"])
    return ACHOut.model_validate(hyp)


@router.delete("/{brief_id}/ach/{hyp_id}", status_code=204)
async def delete_hypothesis(
    brief_id: str,
    hyp_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    async with db.begin():
        hyps = await service.list_hypotheses(db, brief_id)
        hyp = next((h for h in hyps if h.id == hyp_id), None)
        if not hyp:
            raise HTTPException(status_code=404, detail="Hypothesis not found")
        await service.delete_hypothesis(db, hyp)
