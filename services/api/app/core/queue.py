import json
from redis.asyncio import Redis
from .cache import get_redis
from typing import Any

INGESTION_QUEUE = "ingestion:items"
TRIAGE_QUEUE = "triage:items"


async def queue_push(queue_name: str, payload: Any) -> None:
    async with get_redis() as r:
        await r.rpush(queue_name, json.dumps(payload, default=str))


async def queue_pop(queue_name: str, timeout: int = 1) -> dict | None:
    async with get_redis() as r:
        result = await r.blpop(queue_name, timeout=timeout)
        if result:
            _, raw = result
            return json.loads(raw)
        return None


async def queue_length(queue_name: str) -> int:
    async with get_redis() as r:
        return await r.llen(queue_name)
