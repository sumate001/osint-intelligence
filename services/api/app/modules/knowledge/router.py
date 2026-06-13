from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import EntityRecordOut, PatternOut
from . import service

router = APIRouter()


@router.get("/search", response_model=list[EntityRecordOut])
async def search(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    records = await service.search_entities(db, q)
    return [EntityRecordOut.model_validate(r) for r in records]


@router.get("/patterns", response_model=list[PatternOut])
async def get_patterns(min_cases: int = 2, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    return await service.get_patterns(db, min_cases=min_cases)


@router.get("/entity/{entity_name}", response_model=EntityRecordOut | None)
async def get_entity(entity_name: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    return await service.get_entity(db, entity_name)
