from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import PIRCreate, PIRUpdate, PIROut
from . import service

router = APIRouter()


@router.post("", response_model=PIROut, status_code=201)
async def create_pir(body: PIRCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    async with db.begin():
        pir = await service.create_pir(db, body, current_user["id"])
    return PIROut.model_validate(pir)


@router.get("", response_model=list[PIROut])
async def list_pirs(status: str | None = None, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    pirs = await service.list_pirs(db, status=status)
    return [PIROut.model_validate(p) for p in pirs]


@router.get("/{pir_id}", response_model=PIROut)
async def get_pir(pir_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    pir = await service.get_pir(db, pir_id)
    if not pir:
        raise HTTPException(404, "PIR not found")
    return PIROut.model_validate(pir)


@router.patch("/{pir_id}", response_model=PIROut)
async def update_pir(pir_id: str, body: PIRUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    async with db.begin():
        pir = await service.get_pir(db, pir_id)
        if not pir:
            raise HTTPException(404, "PIR not found")
        pir = await service.update_pir(db, pir, body)
    return PIROut.model_validate(pir)


@router.delete("/{pir_id}", status_code=204)
async def delete_pir(pir_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    async with db.begin():
        pir = await service.get_pir(db, pir_id)
        if not pir:
            raise HTTPException(404, "PIR not found")
        await service.delete_pir(db, pir)
