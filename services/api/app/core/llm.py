import httpx
import json
from typing import Any
from .config import get_settings

MODEL_ROUTING: dict[str, str] = {}


def get_model_for_module(module: str) -> str:
    settings = get_settings()
    routing = {
        "triage": settings.triage_model,
        "brief": settings.brief_model,
        "vision": settings.vision_model,
        "simulation": settings.simulation_model,
        "default": settings.ollama_default_model,
    }
    return routing.get(module, routing["default"])


async def chat_completion(
    messages: list[dict],
    module: str = "default",
    model: str | None = None,
    temperature: float = 0.1,
    format: str | None = None,
) -> str:
    settings = get_settings()
    resolved_model = model or get_model_for_module(module)

    payload: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if format:
        payload["format"] = format

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{settings.ollama_base_url}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]


async def chat_json(
    messages: list[dict],
    module: str = "default",
    model: str | None = None,
    temperature: float = 0.1,
) -> dict:
    raw = await chat_completion(messages, module, model, temperature, format="json")
    # strip <think>...</think> blocks if model uses chain-of-thought
    if "<think>" in raw:
        import re
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    return json.loads(raw)


async def health_check() -> bool:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False
