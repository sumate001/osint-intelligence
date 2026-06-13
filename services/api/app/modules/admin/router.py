from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.db import get_db
from ...core.rbac import require_role, Role
from .schemas import AllSettings, SettingsPatch, UserOut, UserCreate, UserUpdate, ServiceHealth, LogEntry
from . import service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

_admin = Depends(require_role(Role.ADMIN))


@router.get("/settings", response_model=AllSettings)
async def get_settings(db: AsyncSession = Depends(get_db), _: dict = _admin):
    return await service.get_settings_merged(db)


@router.patch("/settings", response_model=AllSettings)
async def patch_settings(
    body: SettingsPatch,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.ADMIN)),
):
    return await service.save_settings(db, body, current_user["id"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: dict = _admin):
    users = await service.list_users(db)
    return [UserOut(id=str(u.id), email=u.email, full_name=u.full_name,
                    role=u.role, is_active=u.is_active,
                    created_at=u.created_at.isoformat()) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.ADMIN)),
):
    u = await service.create_user(db, body, current_user["id"])
    return UserOut(id=str(u.id), email=u.email, full_name=u.full_name,
                   role=u.role, is_active=u.is_active, created_at=u.created_at.isoformat())


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.ADMIN)),
):
    u = await service.update_user(db, user_id, body, current_user["id"])
    return UserOut(id=str(u.id), email=u.email, full_name=u.full_name,
                   role=u.role, is_active=u.is_active, created_at=u.created_at.isoformat())


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.ADMIN)),
):
    await service.delete_user(db, user_id, current_user["id"])


@router.get("/health", response_model=list[ServiceHealth])
async def service_health(db: AsyncSession = Depends(get_db), _: dict = _admin):
    settings = await service.get_settings_merged(db)
    return await service.check_health(settings)


@router.get("/logs", response_model=list[LogEntry])
async def system_logs(
    svc: str | None = Query(None, alias="service"),
    level: str | None = Query(None),
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
    _: dict = _admin,
):
    logs = await service.get_logs(db, service=svc, level=level, limit=limit)
    return [
        LogEntry(
            id=log.id,
            timestamp=log.timestamp.isoformat(),
            level=log.level,
            service=log.service,
            message=log.message,
            detail=log.detail,
        )
        for log in logs
    ]
