from celery import Celery
from .core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "osintdesk",
    broker=settings.effective_broker_url,
    backend=settings.effective_result_backend,
    include=[
        "app.modules.triage.tasks",
        "app.modules.investigation.tasks",
        "app.modules.verify.tasks",
        "app.modules.simulation.tasks",
        "app.modules.darkweb.tasks",
        "app.modules.requirements.tasks",
        "app.modules.signals.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "triage.*": {"queue": "triage"},
        "verify.*": {"queue": "triage"},
        "simulation.*": {"queue": "triage"},
        "investigation.*": {"queue": "intel"},
        "requirements.*": {"queue": "intel"},
        "darkweb.*": {"queue": "intel"},
        # Verdict callbacks are light but retry for up to an hour; the intel
        # worker has the concurrency headroom to hold them.
        "signals.*": {"queue": "intel"},
    },
    # Ingestion moved to Horizon, which owns the whole inbound path — fetching,
    # editorial triage, dedup and clustering. Polling here as well would score
    # the same articles twice and, worse, count one story as several because
    # this side only deduplicates on exact URL.
    #
    # The triage module and its adapters are left in place rather than deleted:
    # they still serve the manual re-score path, and removing them would be a
    # much larger change than turning off a schedule.
    beat_schedule={},
)


def run_adapter_task(source_id: str):
    """Trigger single-source ingestion (called from API)."""
    from app.modules.triage.tasks import ingest_source_task
    return ingest_source_task.delay(source_id)
