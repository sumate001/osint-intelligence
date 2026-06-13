import json
from datetime import datetime, timezone
from pathlib import Path

# Append-only audit log — never add delete methods
LOG_PATH = Path("/tmp/osintdesk_audit.jsonl")


def log_event(
    event_type: str,
    user_id: str | None,
    resource: str,
    resource_id: str | None,
    details: dict | None = None,
) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event_type,
        "user_id": user_id,
        "resource": resource,
        "resource_id": resource_id,
        "details": details or {},
    }
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")
