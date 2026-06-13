import asyncio
import json
import os
import shutil

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


_REPO = "/repo"


async def _cmd(*args: str, env: dict | None = None) -> tuple[str, int]:
    """Run a command, return (combined stdout+stderr, returncode)."""
    merged_env = {**os.environ, **(env or {})}
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=merged_env,
    )
    out, _ = await proc.communicate()
    return out.decode().strip(), proc.returncode or 0


def _preflight_errors() -> list[str]:
    """Return list of setup problems that would cause the update to fail."""
    errors = []
    if not os.path.isdir(_REPO):
        errors.append("❌  /repo not mounted — add '- ./:/repo' to docker-compose.dev.yml volumes and recreate the api container")
    if not os.path.exists("/var/run/docker.sock"):
        errors.append("❌  Docker socket not mounted — add '- /var/run/docker.sock:/var/run/docker.sock' and recreate the api container")
    if not shutil.which("git"):
        errors.append("❌  git not found — rebuild the api image (docker compose up -d --build api)")
    if not shutil.which("docker-compose") and not shutil.which("docker"):
        errors.append("❌  docker / docker-compose not found — rebuild the api image (docker compose up -d --build api)")
    return errors


@router.get("/system/version")
async def system_version(
    check_remote: bool = Query(False, description="Fetch origin and compare with remote"),
    _: dict = _admin,
):
    """Return local git commit info. Pass check_remote=true to compare with GitHub."""
    if not os.path.isdir(_REPO) or not shutil.which("git"):
        return {
            "local_commit": "n/a", "local_long": "", "local_message": "git not available (container not rebuilt yet)",
            "local_date": "", "remote_commit": None, "remote_message": None,
            "remote_date": None, "commits_behind": None, "is_up_to_date": None,
        }

    async def git(*args: str) -> str:
        out, _ = await _cmd("git", "-C", _REPO, *args)
        return out

    local_commit  = await git("rev-parse", "--short", "HEAD")
    local_long    = await git("rev-parse", "HEAD")
    local_message = await git("log", "-1", "--pretty=%s")
    local_date    = await git("log", "-1", "--pretty=%cI")

    result: dict = {
        "local_commit": local_commit or "n/a",
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
        result.update({
            "remote_commit": remote_commit,
            "remote_message": remote_message,
            "remote_date": remote_date,
            "commits_behind": behind,
            "is_up_to_date": (local_long == remote_long),
        })

    return result


@router.get("/system/update/stream")
async def stream_system_update(current_user: dict = Depends(require_role(Role.ADMIN))):
    """Stream git pull + docker rebuild + restart output to frontend via SSE."""

    def evt(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    # Determine compose binary
    compose_bin = shutil.which("docker-compose") or "docker-compose"
    compose_cmd = [compose_bin, "-f", f"{_REPO}/docker-compose.dev.yml"]

    async def generate():
        # ── Preflight ───────────────────────────────────────────────────────
        errors = _preflight_errors()
        if errors:
            for e in errors:
                yield evt({"line": e, "error": True})
            yield evt({"line": "💡 Run: docker compose -f docker-compose.dev.yml up -d --build api", "error": True})
            return

        # ── Phase 1: git pull ───────────────────────────────────────────────
        yield evt({"line": "📦 Pulling latest code from GitHub..."})
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", _REPO, "pull", "origin", "main",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        async for raw in proc.stdout:
            line = raw.decode().rstrip()
            if line:
                yield evt({"line": line})
        await proc.wait()
        if proc.returncode != 0:
            yield evt({"line": f"❌ git pull failed (exit {proc.returncode})", "error": True})
            return
        yield evt({"line": "✓ Code updated"})

        # ── Phase 2: build (with cache — only changed layers rebuild) ───────
        yield evt({"line": "🔨 Building images (using cache — only changed layers rebuild)..."})
        proc2 = await asyncio.create_subprocess_exec(
            *compose_cmd, "build", "api", "frontend", "worker", "beat",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "DOCKER_BUILDKIT": "1", "COMPOSE_DOCKER_CLI_BUILD": "1"},
        )
        async for raw in proc2.stdout:
            line = raw.decode().rstrip()
            if line:
                yield evt({"line": line})
        await proc2.wait()
        if proc2.returncode != 0:
            yield evt({"line": f"❌ Build failed (exit {proc2.returncode})", "error": True})
            return
        yield evt({"line": "✓ Build complete"})

        # ── Phase 3: restart (API will go offline) ─────────────────────────
        yield evt({"line": "🔄 Restarting services... connection will drop momentarily.", "restarting": True})
        await asyncio.create_subprocess_exec(*compose_cmd, "up", "-d", "--no-build")
        await asyncio.sleep(2)
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
