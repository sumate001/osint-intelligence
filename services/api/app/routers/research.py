"""Research proxy — forwards queries to SearXNG JSON API."""
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


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    _: dict = Depends(get_current_user),
):
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

    results = [
        SearchResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            content=r.get("content", ""),
            source=r.get("engine", ""),
            score=float(r.get("score", 0.0)),
        )
        for r in data.get("results", [])
        if r.get("url")
    ]

    return SearchResponse(query=q, results=results, total=len(results))
