import asyncio
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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


@router.get("/system/version")
async def system_version(
    check_remote: bool = Query(False, description="Fetch origin and compare with remote"),
    _: dict = _admin,
):
    """Return local git commit info. Pass check_remote=true to compare with GitHub."""

    async def git(*args: str) -> str:
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", "/repo", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await proc.communicate()
        return out.decode().strip()

    local_commit  = await git("rev-parse", "--short", "HEAD")
    local_long    = await git("rev-parse", "HEAD")
    local_message = await git("log", "-1", "--pretty=%s")
    local_date    = await git("log", "-1", "--pretty=%cI")

    result: dict = {
        "local_commit": local_commit,
        "local_long": local_long,
        "local_message": local_message,
        "local_date": local_date,
        "remote_commit": None,
        "remote_message": None,
        "remote_date": None,
        "commits_behind": None,
        "is_up_to_date": None,
    }

    if check_remote:
        await git("fetch", "origin", "--quiet")
        remote_commit  = await git("rev-parse", "--short", "origin/main")
        remote_long    = await git("rev-parse", "origin/main")
        remote_message = await git("log", "-1", "--pretty=%s", "origin/main")
        remote_date    = await git("log", "-1", "--pretty=%cI", "origin/main")
        behind_str     = await git("rev-list", "--count", "HEAD..origin/main")
        behind         = int(behind_str) if behind_str.isdigit() else 0

        result["remote_commit"]  = remote_commit
        result["remote_message"] = remote_message
        result["remote_date"]    = remote_date
        result["commits_behind"] = behind
        result["is_up_to_date"]  = (local_long == remote_long)

    return result


@router.get("/system/update/stream")
async def stream_system_update(current_user: dict = Depends(require_role(Role.ADMIN))):
    """Stream git pull + docker rebuild + restart output to frontend via SSE."""

    def evt(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    async def run(cmd: list[str]) -> tuple[asyncio.subprocess.Process, list[str]]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        return proc

    async def generate():
        # ── Phase 1: git pull ───────────────────────────────────────────────
        yield evt({"line": "📦 Pulling latest code from GitHub..."})
        proc = await run(["git", "-C", "/repo", "pull", "origin", "main"])
        async for raw in proc.stdout:
            yield evt({"line": raw.decode().rstrip()})
        await proc.wait()
        if proc.returncode != 0:
            yield evt({"line": f"❌ git pull failed (exit {proc.returncode})", "error": True})
            return

        # ── Phase 2: build images ───────────────────────────────────────────
        yield evt({"line": "🔨 Building updated images (this may take a few minutes)..."})
        proc2 = await run([
            "docker-compose", "-f", "/repo/docker-compose.dev.yml",
            "build", "--no-cache", "api", "frontend", "worker", "beat",
        ])
        async for raw in proc2.stdout:
            yield evt({"line": raw.decode().rstrip()})
        await proc2.wait()
        if proc2.returncode != 0:
            yield evt({"line": f"❌ Build failed (exit {proc2.returncode})", "error": True})
            return

        # ── Phase 3: restart (API will go offline) ─────────────────────────
        yield evt({"line": "🔄 Restarting services... API will go offline in a moment.", "restarting": True})
        await asyncio.create_subprocess_exec(
            "docker-compose", "-f", "/repo/docker-compose.dev.yml",
            "up", "-d", "--no-build",
        )
        await asyncio.sleep(3)
        yield evt({"line": "__RESTARTING__", "restarting": True})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
