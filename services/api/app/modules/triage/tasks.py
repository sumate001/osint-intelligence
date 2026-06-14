import asyncio
import logging
from datetime import datetime, timezone, timedelta

from ...worker import celery_app
from ...core.config import get_settings

logger = logging.getLogger(__name__)


@celery_app.task(name="triage.poll_all_sources", bind=True)
def poll_all_sources_task(self):
    """Beat task: check all active sources and trigger ingestion if interval elapsed."""
    asyncio.run(_poll_all())


async def _poll_all():
    AsyncSessionLocal = _make_celery_session()
    from ...models.source import Source
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Source).where(Source.is_active == True))
        sources = result.scalars().all()

    now = datetime.now(timezone.utc)
    for source in sources:
        due = (
            source.last_fetched_at is None
            or (now - source.last_fetched_at) >= timedelta(seconds=source.poll_interval_seconds)
        )
        if due:
            ingest_source_task.delay(str(source.id))


@celery_app.task(
    name="triage.ingest_source",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def ingest_source_task(self, source_id: str):
    """Fetch from a single source and score all new items."""
    asyncio.run(_ingest_source(source_id))


def _make_celery_session():
    """Create a fresh async engine+session for Celery tasks (NullPool avoids loop conflicts)."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from ...core.config import get_settings
    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _ingest_source(source_id: str):
    AsyncSessionLocal = _make_celery_session()
    from ...models.source import Source
    from .models import FeedItem
    from ...modules.reliability.service import assign_admiralty
    from ...adapters.registry import load_adapter
    from .service import score_item
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Source).where(Source.id == source_id))
        source = result.scalar_one_or_none()
        if not source or not source.is_active:
            logger.warning("Source %s not found or inactive", source_id)
            return

        config = {
            **source.config,
            "source_id": str(source.id),
            "adapter_type": source.adapter_type,
            "source_weight": source.source_weight,
            "verified_source": source.verified_source,
        }
        adapter = load_adapter(config)

        try:
            items = await adapter.run()
        except Exception as e:
            source.last_error = str(e)[:1000]
            source.error_count += 1
            await db.commit()
            logger.error("Adapter error for source %s: %s", source_id, e)
            return

        new_count = 0
        for canonical in items:
            # Dedup check — use limit(1) + scalar to avoid MultipleResultsFound
            exists = (await db.execute(
                select(FeedItem.id).where(
                    FeedItem.external_id == canonical.external_id,
                    FeedItem.source_id == canonical.source_id,
                ).limit(1)
            )).scalar_one_or_none()
            if exists:
                continue

            # LLM triage scoring
            try:
                scores = await score_item(canonical)
            except Exception as e:
                logger.warning("Scoring failed for %s: %s", canonical.external_id, e)
                continue

            # Admiralty code
            admiralty = assign_admiralty(source, canonical)

            feed_item = FeedItem(
                external_id=canonical.external_id,
                source_id=canonical.source_id,
                source_name=source.name,
                source_type=canonical.source_type.value,
                title=canonical.title,
                body=canonical.body,
                url=canonical.url,
                language=canonical.language,
                published_at=canonical.published_at,
                ingested_at=canonical.ingested_at,
                scored_at=datetime.now(timezone.utc),
                score_relevance=scores.relevance,
                score_urgency=scores.urgency,
                score_impact=scores.impact,
                score_novelty=scores.novelty,
                score_reliability=scores.reliability,
                score_sensitivity=scores.sensitivity,
                score_actionability=scores.actionability,
                total_score=scores.total,
                verdict=scores.verdict,
                verdict_reason=scores.verdict_reason,
                entities=scores.entities,
                admiralty_source=admiralty["source_code"],
                admiralty_info=admiralty["info_code"],
                source_weight=canonical.source_weight,
                verified_source=canonical.verified_source,
                raw_metadata=canonical.raw_metadata,
                media=[m.model_dump() for m in canonical.media],
            )
            db.add(feed_item)
            # Index in Meilisearch for full-text search
            from ...core.search import index_item
            index_item(str(feed_item.id) if feed_item.id else canonical.external_id, {
                "title": feed_item.title or "",
                "body": (feed_item.body or "")[:2000],
                "source_name": feed_item.source_name or "",
                "source_id": str(feed_item.source_id or ""),
                "source_type": feed_item.source_type or "",
                "verdict": feed_item.verdict or "",
                "total_score": float(feed_item.total_score or 0),
                "is_archived": bool(feed_item.is_archived),
                "published_at": feed_item.published_at.isoformat() if feed_item.published_at else "",
                "ingested_at": feed_item.ingested_at.isoformat() if feed_item.ingested_at else "",
                "entities": " ".join(
                    e.get("name", e.get("value", "")) for e in (feed_item.entities or [])
                    if isinstance(e, dict)
                ),
            })
            new_count += 1

        source.last_fetched_at = datetime.now(timezone.utc)
        source.success_count += 1
        source.last_error = None
        await db.commit()
        logger.info("Source %s: stored %d new items", source_id, new_count)
