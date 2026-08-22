"""Celery task: send the analyst's verdict back to Horizon.

This callback is the feedback loop that trains the radar — the spec calls it a
first-class requirement, not an afterthought. It is still fire-and-forget from
the UI's point of view: a failed callback must never block a case from closing.

Retry schedule is 30s → 2m → 10m → 1h, then `callback_status='failed'`.
"""

import asyncio
import logging
import uuid

import httpx

from ...core.config import get_settings
from ...worker import celery_app

log = logging.getLogger(__name__)

#: Seconds to wait before each retry. Matches Horizon's outbound schedule so the
#: two systems fail over on the same rhythm.
BACKOFF_SECONDS = (30, 120, 600, 3600)
VERDICT_PATH = "/api/v1/verdicts"
TIMEOUT = 20.0
#: A 4xx other than these means Horizon rejected the body; resending it unchanged
#: would only repeat the rejection.
RETRYABLE_CLIENT_ERRORS = frozenset({408, 425, 429})


def is_retryable(status_code: int) -> bool:
    return status_code >= 500 or status_code in RETRYABLE_CLIENT_ERRORS


def _make_session():
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(get_settings().postgres_url, poolclass=NullPool)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(
    name="signals.send_verdict",
    bind=True,
    max_retries=len(BACKOFF_SECONDS),
    queue="intel",
)
def send_verdict(self, external_signal_id: str) -> None:
    """Deliver one verdict. Reschedules itself on retryable failure."""
    outcome = asyncio.run(_send(external_signal_id))

    if outcome != "retry":
        return

    attempt = self.request.retries  # 0 on the first run
    if attempt >= len(BACKOFF_SECONDS):
        asyncio.run(_mark(external_signal_id, "failed"))
        log.warning(
            "giving up on the verdict callback",
            extra={"osint_signal_id": external_signal_id, "attempts": attempt + 1},
        )
        return

    countdown = BACKOFF_SECONDS[attempt]
    log.info(
        "verdict callback failed, retry scheduled",
        extra={"osint_signal_id": external_signal_id, "in_seconds": countdown},
    )
    raise self.retry(countdown=countdown)


async def _mark(external_signal_id: str, status: str, error: str | None = None) -> None:
    from .models import ExternalSignal

    session_factory = _make_session()
    async with session_factory() as db:
        signal = await db.get(ExternalSignal, uuid.UUID(external_signal_id))
        if signal is None:
            return
        signal.callback_status = status
        if error is not None:
            signal.callback_error = error
        await db.commit()


async def _send(external_signal_id: str) -> str:
    """One delivery attempt. Returns 'done', 'retry' or 'skip'."""
    from .models import ExternalSignal

    settings = get_settings()
    session_factory = _make_session()

    async with session_factory() as db:
        signal = await db.get(ExternalSignal, uuid.UUID(external_signal_id))
        if signal is None:
            log.warning("signal vanished before callback", extra={"id": external_signal_id})
            return "skip"

        if not settings.horizon_base_url:
            # Integration not configured. Log at INFO and stop — this is a
            # deployment choice, not a failure to report.
            log.info(
                "HORIZON_BASE_URL unset — skipping verdict callback",
                extra={"osint_signal_id": external_signal_id},
            )
            signal.callback_status = "disabled"
            await db.commit()
            return "skip"

        body = {
            "signal_id": str(signal.signal_id),
            "osint_signal_id": str(signal.id),
            "verdict": signal.verdict,
            "analyst_note": signal.analyst_note,
            "closed_at": (signal.closed_at or signal.received_at).isoformat(),
        }
        attempts = signal.callback_attempts

    url = f"{settings.horizon_base_url.rstrip('/')}{VERDICT_PATH}"
    headers = {"X-API-Key": settings.horizon_api_key, "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.post(url, json=body, headers=headers)
    except Exception as exc:  # noqa: BLE001 — transport trouble is retryable
        await _bump(external_signal_id, attempts, f"transport: {exc}", "pending")
        return "retry"

    if response.status_code == 200:
        async with session_factory() as db:
            signal = await db.get(ExternalSignal, uuid.UUID(external_signal_id))
            if signal is not None:
                signal.callback_status = "delivered"
                signal.callback_attempts = attempts + 1
                signal.callback_error = None
                await db.commit()
        log.info(
            "verdict delivered to Horizon",
            extra={"osint_signal_id": external_signal_id, "verdict": body["verdict"]},
        )
        return "done"

    detail = f"HTTP {response.status_code}: {response.text[:200]}"
    if is_retryable(response.status_code):
        await _bump(external_signal_id, attempts, detail, "pending")
        return "retry"

    await _bump(external_signal_id, attempts, detail, "failed")
    log.warning(
        "Horizon rejected the verdict",
        extra={"osint_signal_id": external_signal_id, "error": detail},
    )
    return "done"


async def _bump(external_signal_id: str, attempts: int, error: str, status: str) -> None:
    from .models import ExternalSignal

    session_factory = _make_session()
    async with session_factory() as db:
        signal = await db.get(ExternalSignal, uuid.UUID(external_signal_id))
        if signal is None:
            return
        signal.callback_attempts = attempts + 1
        signal.callback_error = error
        signal.callback_status = status
        await db.commit()
