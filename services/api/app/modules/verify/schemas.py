import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class VerifyJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    file_type: str
    status: str
    file_size: int | None
    feed_item_id: uuid.UUID | None

    # EXIF
    exif_data: dict
    gps_lat: float | None
    gps_lon: float | None
    gps_timestamp: str | None
    camera_make: str | None
    camera_model: str | None

    # Wayback
    wayback_url: str | None
    wayback_first_seen: datetime | None

    # Duplicates
    duplicate_hits: list

    # Transcript
    transcript: str | None

    # Verdict
    verdict: str | None
    verdict_notes: str | None

    created_at: datetime
    completed_at: datetime | None


class VerifyJobListOut(BaseModel):
    items: list[VerifyJobOut]
    total: int
