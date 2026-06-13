import time
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...models.user import User
from ...core.auth import hash_password
from .models import SystemSettings, SystemLog
from .schemas import AllSettings, SettingsPatch, ServiceHealth


async def get_settings_merged(db: AsyncSession) -> AllSettings:
    """Load DB overrides, fall back to env defaults."""
    env = get_settings()
    defaults = AllSettings(
        ai={
            "ollama_base_url": env.ollama_base_url,
            "ollama_default_model": env.ollama_default_model,
            "vision_model": env.vision_model,
            "embed_model": "nomic-embed-text",
            "max_concurrent": 4,
            "cloud_fallback_url": "",
            "cloud_fallback_key": "",
        },
        model_routing={
            "triage_model": env.triage_model,
            "brief_model": env.brief_model,
            "vision_model": env.vision_model,
            "simulation_model": env.simulation_model,
        },
        searxng={"url": env.searxng_url},
        perplexica={"url": env.perplexica_url},
        spiderfoot={"url": env.spiderfoot_url},
    )

    row = (await db.execute(select(SystemSettings).where(SystemSettings.id == 1))).scalar_one_or_none()
    if not row or not row.data:
        return defaults

    merged = defaults.model_dump()
    db_data: dict = row.data
    for section, values in db_data.items():
        if section in merged and isinstance(values, dict):
            merged[section].update(values)

    return AllSettings.model_validate(merged)


async def save_settings(db: AsyncSession, patch: SettingsPatch, user_id: str) -> AllSettings:
    row = (await db.execute(select(SystemSettings).where(SystemSettings.id == 1))).scalar_one_or_none()
    if not row:
        row = SystemSettings(id=1, data={})
        db.add(row)

    current: dict = dict(row.data or {})
    patch_data = patch.model_dump(exclude_none=True)
    for section, values in patch_data.items():
        if values is not None:
            current[section] = {**(current.get(section) or {}), **{k: v for k, v in values.items()}}

    row.data = current
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user_id
    await db.flush()

    await write_log(db, "INFO", "api", "Settings updated", {"sections": list(patch_data.keys()), "by": user_id})
    return await get_settings_merged(db)


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def create_user(db: AsyncSession, data, actor_id: str) -> User:
    existing = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if existing:
        from fastapi import HTTPException
        raise HTTPException(400, "Email already registered")
    user = User(
        id=uuid.uuid4(),
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await write_log(db, "INFO", "api", f"User created: {data.email}", {"role": data.role, "by": actor_id})
    return user


async def update_user(db: AsyncSession, user_id: str, data, actor_id: str) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(404, "User not found")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password is not None:
        user.hashed_password = hash_password(data.password)
    await db.flush()
    await write_log(db, "INFO", "api", f"User updated: {user.email}", {"by": actor_id})
    return user


async def delete_user(db: AsyncSession, user_id: str, actor_id: str) -> None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(404, "User not found")
    if str(user.id) == actor_id:
        from fastapi import HTTPException
        raise HTTPException(400, "Cannot delete your own account")
    await db.delete(user)
    await write_log(db, "WARN", "api", f"User deleted: {user.email}", {"by": actor_id})


async def check_health(settings_merged: AllSettings) -> list[ServiceHealth]:
    env = get_settings()
    checks: list[tuple[str, str]] = [
        ("PostgreSQL", env.postgres_url.replace("+asyncpg", "").split("@")[-1]),
        ("Redis", env.redis_url),
        ("Ollama", f"{settings_merged.ai.ollama_base_url}/api/tags"),
        ("Meilisearch", f"{settings_merged.databases.meilisearch_url}/health"),
        ("MinIO", f"{settings_merged.storage.minio_endpoint}/minio/health/live"),
        ("SearXNG", f"{settings_merged.searxng.url}/healthz"),
        ("Perplexica", f"{settings_merged.perplexica.url}/api/health"),
        ("SpiderFoot", f"{settings_merged.spiderfoot.url}/api/v1/ping" if settings_merged.spiderfoot.url else ""),
        ("MiroFish", f"{settings_merged.mirofish.url}/health" if settings_merged.mirofish.url else ""),
        ("n8n", f"{settings_merged.n8n.url}/healthz" if settings_merged.n8n.url else ""),
    ]

    results: list[ServiceHealth] = []
    async with httpx.AsyncClient(timeout=3.0) as client:
        for name, url in checks:
            if not url or url.startswith("postgresql") or url.startswith("redis"):
                results.append(ServiceHealth(name=name, status="unknown", detail="not checked via HTTP"))
                continue
            t0 = time.monotonic()
            try:
                resp = await client.get(url)
                latency = round((time.monotonic() - t0) * 1000, 1)
                if resp.status_code < 400:
                    results.append(ServiceHealth(name=name, status="ok", latency_ms=latency))
                else:
                    results.append(ServiceHealth(name=name, status="error", latency_ms=latency, detail=f"HTTP {resp.status_code}"))
            except Exception as exc:
                latency = round((time.monotonic() - t0) * 1000, 1)
                results.append(ServiceHealth(name=name, status="error", latency_ms=latency, detail=str(exc)[:120]))

    # Check Celery separately
    try:
        from ...worker import celery_app
        active = celery_app.control.inspect(timeout=2).active()
        results.append(ServiceHealth(name="Celery", status="ok" if active else "error", detail=f"{len(active or {})} worker(s)"))
    except Exception as exc:
        results.append(ServiceHealth(name="Celery", status="error", detail=str(exc)[:80]))

    # Check Postgres via SQLAlchemy
    try:
        from sqlalchemy import text
        from ...core.db import AsyncSessionLocal
        async with AsyncSessionLocal() as s:
            await s.execute(text("SELECT 1"))
        results[0] = ServiceHealth(name="PostgreSQL", status="ok")
    except Exception as exc:
        results[0] = ServiceHealth(name="PostgreSQL", status="error", detail=str(exc)[:80])

    return results


async def get_logs(
    db: AsyncSession,
    service: str | None = None,
    level: str | None = None,
    limit: int = 200,
) -> list[SystemLog]:
    q = select(SystemLog).order_by(SystemLog.timestamp.desc()).limit(limit)
    if service and service != "all":
        q = q.where(SystemLog.service == service)
    if level and level != "all":
        q = q.where(SystemLog.level == level)
    return list((await db.execute(q)).scalars().all())


async def write_log(db: AsyncSession, level: str, service: str, message: str, detail: dict | None = None) -> None:
    log = SystemLog(level=level, service=service, message=message, detail=detail)
    db.add(log)
