"""What a point on the newsroom map carries."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MapPoint(BaseModel):
    """One place, and what happened there.

    A point is a *place*, not an event: the same district appears in a dozen
    signals over a week, and a dozen pins stacked on one dot is a worse map than
    one pin that says twelve. The signals are carried along so clicking through
    reaches the reporting rather than a number.
    """

    model_config = ConfigDict(from_attributes=True)

    name: str
    label: str | None = None
    latitude: float
    longitude: float
    qid: str | None = None
    #: How many events across all signals put something here.
    count: int
    #: Most recent first — a map of a running story is read newest-first.
    events: list["MapEvent"]


class MapEvent(BaseModel):
    when: datetime | None
    summary: str
    source_name: str = ""
    url: str = ""
    signal_id: uuid.UUID
    signal_title: str
    profile_id: uuid.UUID | None = None


class MapOut(BaseModel):
    points: list[MapPoint]
    #: Place names that appeared in the signals but have no coordinates yet —
    #: either never asked, or asked and Wikidata had nothing. Reported rather
    #: than dropped: a map that silently omits a third of the reporting is worse
    #: than one that says how much it is missing.
    unresolved: list[str]
    unresolved_events: int


MapPoint.model_rebuild()
