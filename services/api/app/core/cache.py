from redis.asyncio import Redis, ConnectionPool
from .config import get_settings
import json
from typing import Any

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool.from_url(settings.redis_url, decode_responses=True)
    return _pool


def get_redis() -> Redis:
    return Redis(connection_pool=get_pool())


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    async with get_redis() as r:
        await r.setex(key, ttl, json.dumps(value, default=str))


async def cache_get(key: str) -> Any | None:
    async with get_redis() as r:
        raw = await r.get(key)
        return json.loads(raw) if raw else None


async def cache_delete(key: str) -> None:
    async with get_redis() as r:
        await r.delete(key)
