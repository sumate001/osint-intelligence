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
    # Beat schedule — periodic ingestion
    beat_schedule={
        "poll-all-sources": {
            "task": "triage.poll_all_sources",
            "schedule": 60.0,
            "options": {"queue": "triage"},
        },
    },
)


def run_adapter_task(source_id: str):
    """Trigger single-source ingestion (called from API)."""
    from app.modules.triage.tasks import ingest_source_task
    return ingest_source_task.delay(source_id)
