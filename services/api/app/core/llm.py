import httpx
import json
import logging
from typing import Any
from .config import get_settings

log = logging.getLogger(__name__)

MODEL_ROUTING: dict[str, str] = {}


def get_model_for_module(module: str) -> str:
    settings = get_settings()
    routing = {
        "triage": settings.triage_model,
        "brief": settings.brief_model,
        "vision": settings.vision_model,
        "simulation": settings.simulation_model,
        "requirements": settings.requirements_model,
        "deception": settings.deception_model,
        "darkweb": settings.darkweb_model,
        "default": settings.ollama_default_model,
    }
    return routing.get(module, routing["default"])


TIMEOUT_BY_MODULE: dict[str, float] = {
    "simulation": 600.0,  # simulation prompt is large; 10min ceiling
    "brief": 300.0,
    "requirements": 360.0,  # EEI generation + matching can be slow when LLM is busy
    "default": 120.0,
}


async def chat_completion(
    messages: list[dict],
    module: str = "default",
    model: str | None = None,
    temperature: float = 0.1,
    format: str | None = None,
    timeout: float | None = None,
) -> str:
    settings = get_settings()
    resolved_model = model or get_model_for_module(module)
    resolved_timeout = timeout or TIMEOUT_BY_MODULE.get(module, TIMEOUT_BY_MODULE["default"])

    payload: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if format:
        payload["format"] = format

    async with httpx.AsyncClient(timeout=resolved_timeout) as client:
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
    timeout: float | None = None,
) -> dict:
    raw = await chat_completion(messages, module, model, temperature, format="json", timeout=timeout)
    # strip <think>...</think> blocks if model uses chain-of-thought
    if "<think>" in raw:
        import re
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    return json.loads(raw)


async def transcribe_audio(audio_bytes: bytes, model: str | None = None) -> str | None:
    """Transcribe audio/video audio track using Ollama Whisper.
    Sends raw WAV bytes (16kHz mono) encoded as base64 to /api/generate.
    Returns transcript string or None if unavailable."""
    import base64
    settings = get_settings()
    resolved_model = model or getattr(settings, "whisper_model", "whisper")
    audio_b64 = base64.b64encode(audio_bytes).decode()
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": resolved_model, "prompt": "", "audio": audio_b64},
            )
            response.raise_for_status()
            text = response.json().get("response", "").strip()
            return text or None
    except Exception as exc:
        log.warning("Whisper transcription failed (%s): %s", resolved_model, exc)
        return None


async def analyze_image_b64(image_b64: str, prompt: str, model: str | None = None) -> str:
    """Analyze a single image (base64 JPEG/PNG) with the vision model. Returns empty string on failure."""
    settings = get_settings()
    resolved_model = model or getattr(settings, "vision_model", "gemma3:27b")
    messages = [{"role": "user", "content": prompt, "images": [image_b64]}]
    try:
        return await chat_completion(messages, module="vision", model=resolved_model, timeout=120.0)
    except Exception as exc:
        log.warning("Vision analysis failed (%s): %s", resolved_model, exc)
        return ""


async def health_check() -> bool:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False
