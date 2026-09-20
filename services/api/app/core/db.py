import sys

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from .config import get_settings


class Base(DeclarativeBase):
    pass


#: Celery workers get an unpooled engine; the API keeps its pool.
#:
#: Every Celery task here runs `asyncio.run(...)`, which builds a fresh event
#: loop and closes it on the way out. A pooled asyncpg connection outlives that
#: loop and is handed to the next task still bound to the dead one, which fails
#: as "Event loop is closed" or "attached to a different loop". It is
#: intermittent by nature — a task that happens to open a new connection works,
#: one that reuses a pooled connection does not — so it reads as flakiness
#: rather than as a bug with a cause.
#:
#: `get_effective_model()` already builds a private NullPool engine per call for
#: exactly this reason. That fixed one function; this fixes every task, and
#: leaves the API alone, where one long-lived loop makes pooling correct.
IS_WORKER = "celery" in sys.argv[0]


def _make_engine():
    settings = get_settings()
    if IS_WORKER:
        return create_async_engine(
            settings.postgres_url,
            echo=settings.debug,
            poolclass=NullPool,
        )
    return create_async_engine(
        settings.postgres_url,
        echo=settings.debug,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
