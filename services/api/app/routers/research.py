"""Research proxy — SearXNG search + AI-synthesized answers via Ollama."""
import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from ..core.auth import get_current_user
from ..core.config import get_settings

router = APIRouter()


class SearchResult(BaseModel):
    title: str
    url: str
    content: str
    source: str = ""
    score: float = 0.0


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


class AISearchResponse(BaseModel):
    query: str
    answer: str
    reasoning: str | None = None  # chain-of-thought from thinking models
    sources: list[SearchResult]


async def _searxng_search(q: str, limit: int = 8) -> list[SearchResult]:
    settings = get_settings()
    searxng_url = settings.searxng_url or "http://searxng:8080"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{searxng_url}/search",
                params={"q": q, "format": "json"},
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
                    "Accept": "application/json, text/html, */*",
                    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="SearXNG timeout")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SearXNG error: {exc}")

    return [
        SearchResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            content=r.get("content", ""),
            source=r.get("engine", ""),
            score=float(r.get("score", 0.0)),
        )
        for r in data.get("results", [])[:limit]
        if r.get("url")
    ]


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    _: dict = Depends(get_current_user),
):
    results = await _searxng_search(q)
    return SearchResponse(query=q, results=results, total=len(results))


@router.get("/ai-search", response_model=AISearchResponse)
async def ai_search(
    q: str = Query(..., min_length=1),
    _: dict = Depends(get_current_user),
):
    """Search SearXNG then synthesize a concise answer with Ollama (Perplexica-style)."""
    sources = await _searxng_search(q, limit=6)

    if not sources:
        return AISearchResponse(query=q, answer="ไม่พบข้อมูลจากการค้นหา", sources=[])

    # Build context from top results
    context_parts = []
    for i, r in enumerate(sources[:5], 1):
        snippet = (r.content or r.title)[:400]
        context_parts.append(f"[{i}] {r.title}\nURL: {r.url}\n{snippet}")
    context = "\n\n".join(context_parts)

    settings = get_settings()
    ollama_url = settings.ollama_base_url or "http://host.docker.internal:11434"
    model = getattr(settings, "triage_model", None) or settings.ollama_default_model or "qwen3.5:latest"

    prompt = (
        "You are a research analyst. Based ONLY on the sources below, answer the query concisely.\n"
        "Cite sources using [1], [2], etc. Always write your answer in Thai (ภาษาไทย), regardless of the query language. "
        "If sources are insufficient, say so clearly.\n\n"
        f"QUERY: {q}\n\n"
        f"SOURCES:\n{context}\n\n"
        "ANSWER:"
    )

    reasoning: str | None = None
    answer_text = ""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    # num_predict must be large enough for thinking tokens + final answer.
                    # qwen3.x thinking models can use 2000-4000 tokens for reasoning alone.
                    "options": {"temperature": 0.1, "num_predict": 4096},
                },
            )
            resp.raise_for_status()
            msg = resp.json().get("message", {})
            # Thinking models (qwen3.x): Ollama separates reasoning into `thinking` field
            # and the final model response into `content`. Both are returned to the caller
            # so the frontend can show a clean answer + collapsible reasoning trace.
            answer_text = (msg.get("content") or "").strip()
            thinking_text = (msg.get("thinking") or "").strip()
            reasoning = thinking_text or None
            # Fallback: if the model put everything in thinking and left content empty,
            # use the thinking field as the answer so the user sees something.
            if not answer_text and thinking_text:
                answer_text = thinking_text
                reasoning = None  # already shown as answer, no need to duplicate
    except Exception as exc:
        answer_text = f"LLM synthesis failed: {exc}"

    return AISearchResponse(query=q, answer=answer_text, reasoning=reasoning, sources=sources)
