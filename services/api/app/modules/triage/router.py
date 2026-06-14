from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, case
import uuid

from ...core.db import get_db
from ...core.auth import get_current_user
from .models import FeedItem
from .schemas import FeedItemOut, FeedItemList, FeedItemUpdate

router = APIRouter()


def _item_to_out(item: FeedItem) -> FeedItemOut:
    return FeedItemOut(
        id=str(item.id),
        external_id=item.external_id,
        source_id=item.source_id,
        source_name=item.source_name,
        source_type=item.source_type,
        title=item.title,
        body=item.body,
        url=item.url,
        language=item.language,
        published_at=item.published_at,
        ingested_at=item.ingested_at,
        scored_at=item.scored_at,
        score_relevance=item.score_relevance,
        score_urgency=item.score_urgency,
        score_impact=item.score_impact,
        score_novelty=item.score_novelty,
        score_reliability=item.score_reliability,
        score_sensitivity=item.score_sensitivity,
        score_actionability=item.score_actionability,
        total_score=item.total_score,
        verdict=item.verdict,
        verdict_reason=item.verdict_reason,
        admiralty_source=item.admiralty_source,
        admiralty_info=item.admiralty_info,
        entities=item.entities or {},
        source_weight=item.source_weight,
        verified_source=item.verified_source,
        is_read=item.is_read,
        is_archived=item.is_archived,
        case_id=item.case_id,
        media=item.media or [],
    )


@router.get("/items", response_model=FeedItemList)
async def list_items(
    verdict: str | None = Query(None, description="Filter by verdict"),
    source_id: str | None = Query(None),
    is_archived: bool = Query(False),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(FeedItem).where(FeedItem.is_archived == is_archived)

    if verdict:
        q = q.where(FeedItem.verdict == verdict.upper())
    if source_id:
        q = q.where(FeedItem.source_id == source_id)

    meili_ids: list[str] | None = None
    if search:
        from ...core.search import search_items
        filters = f"is_archived = {str(is_archived).lower()}"
        if verdict:
            filters += f" AND verdict = {verdict.upper()}"
        meili_ids = search_items(search, filters=filters, limit=500)
        if meili_ids:
            import uuid as _uuid
            valid_ids = []
            for mid in meili_ids:
                try:
                    valid_ids.append(_uuid.UUID(mid))
                except ValueError:
                    pass
            q = select(FeedItem).where(FeedItem.id.in_(valid_ids), FeedItem.is_archived == is_archived)
        else:
            # Meilisearch unavailable or no results — SQL fallback
            q = q.where(
                or_(
                    FeedItem.title.ilike(f"%{search}%"),
                    FeedItem.body.ilike(f"%{search}%"),
                )
            )

    # total count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # paginated results — PRIORITY first, then FAST_TRACK, INVESTIGATE, PASS
    verdict_order = case(
        (FeedItem.verdict == "PRIORITY", 0),
        (FeedItem.verdict == "FAST_TRACK", 1),
        (FeedItem.verdict == "INVESTIGATE", 2),
        (FeedItem.verdict == "PASS", 3),
        else_=4,
    )
    q = (
        q.order_by(
            verdict_order,
            FeedItem.total_score.desc().nulls_last(),
            FeedItem.ingested_at.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    items = [_item_to_out(r) for r in result.scalars().all()]

    return FeedItemList(items=items, total=total, page=page, page_size=page_size)


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verdicts = ["PRIORITY", "INVESTIGATE", "FAST_TRACK", "PASS"]
    stats: dict[str, int] = {}
    for v in verdicts:
        count_q = select(func.count()).where(
            FeedItem.verdict == v, FeedItem.is_archived == False
        )
        stats[v.lower()] = (await db.execute(count_q)).scalar_one()

    total_q = select(func.count()).where(FeedItem.is_archived == False)
    stats["total"] = (await db.execute(total_q)).scalar_one()
    return stats


@router.get("/items/{item_id}", response_model=FeedItemOut)
async def get_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(FeedItem).where(FeedItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _item_to_out(item)


@router.patch("/items/{item_id}", response_model=FeedItemOut)
async def update_item(
    item_id: uuid.UUID,
    body: FeedItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(FeedItem).where(FeedItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    return _item_to_out(item)
