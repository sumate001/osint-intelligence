from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import DeceptionCheckCreate, DeceptionCheckOut
from . import service

router = APIRouter()


@router.post("", response_model=DeceptionCheckOut, status_code=201)
async def run_check(body: DeceptionCheckCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    async with db.begin():
        check = await service.run_check(db, body, current_user["id"])
    return DeceptionCheckOut.model_validate(check)


@router.get("", response_model=list[DeceptionCheckOut])
async def list_checks(case_id: str | None = None, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    checks = await service.list_checks(db, case_id=case_id)
    return [DeceptionCheckOut.model_validate(c) for c in checks]
