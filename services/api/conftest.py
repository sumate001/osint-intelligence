"""Shared test fixtures.

Unit tests need none of this — they are marked `unit` and touch nothing. The
fixtures here exist for the `integration` tests, which need a real database
because what they verify (a UNIQUE constraint making re-delivery idempotent, a
foreign key linking a signal to the case it opened) does not exist in a mock.

Every test runs inside a transaction that is rolled back afterwards, so a suite
run leaves the database exactly as it found it. That matters more than usual
here: the integration tests are meant to be runnable against the same database
the stack is using.
"""

import os

# A live model must not sit on the path of every ingest. Once two profiles were
# defined, a signal with no category match asked the model which box it belonged
# in — correct in production, and it took this suite from five seconds to three
# minutes. Tests that care about that decision turn it back on themselves.
#
# Assigned, not setdefault: the api container sets SIGNAL_PROFILE_MATCHING=true,
# which is right for the running system and meant this line did nothing when the
# suite was run where it is normally run — inside that container. It went
# unnoticed while the model was fast; raising the timeout to match the hardware
# turned a slow suite into one that does not finish. A test run must not depend
# on the environment of the process it happens to be launched from.
os.environ["SIGNAL_PROFILE_MATCHING"] = "false"

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool


def _database_url() -> str:
    """TEST_POSTGRES_URL if set, otherwise whatever the app is configured with.

    Pointing at a throwaway database is safer, but the rollback below makes the
    app's own database an acceptable default — and one that works with no setup.
    """
    explicit = os.getenv("TEST_POSTGRES_URL")
    if explicit:
        return explicit

    from app.core.config import get_settings

    return get_settings().postgres_url


@pytest_asyncio.fixture
async def db_engine():
    """A fresh engine per test.

    Deliberately not session-scoped. pytest-asyncio gives each test its own
    event loop, and an engine built on an earlier loop fails once that loop is
    closed — the symptom is a test that passes alone and fails in a suite run,
    which is the worst kind to debug. With NullPool an engine costs almost
    nothing, so the simple thing is also the correct one here.

    Skips rather than errors when there is no database, so `pytest` still works
    on a laptop with nothing running.
    """
    engine = create_async_engine(_database_url(), poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except Exception as exc:  # noqa: BLE001
        await engine.dispose()
        pytest.skip(f"no database available for integration tests: {exc}")

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(db_engine):
    """A session whose writes are always undone.

    The session joins an outer transaction by way of a savepoint, so code under
    test can call `commit()` normally — it releases the savepoint — while the
    outer transaction still rolls back everything at the end.
    """
    async with db_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest_asyncio.fixture
async def client(db):
    """HTTP client bound to the same transaction as the `db` fixture.

    Without the dependency override the app would open its own sessions and
    commit for real, which would both leak rows and hide them from assertions
    made through `db`.
    """
    from httpx import ASGITransport, AsyncClient

    from app.core.db import get_db
    from app.main import app

    async def _use_test_session():
        yield db

    app.dependency_overrides[get_db] = _use_test_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
