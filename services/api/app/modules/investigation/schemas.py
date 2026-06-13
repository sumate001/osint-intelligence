import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CaseCreate(BaseModel):
    title: str
    description: str = ""
    feed_item_id: str | None = None
    tags: list[str] = []


class CaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    assigned_to: str | None = None
    tags: list[str] | None = None


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    status: str
    feed_item_id: str | None
    created_by: str
    assigned_to: str | None
    tags: list
    created_at: datetime
    updated_at: datetime


class CaseListOut(BaseModel):
    items: list[CaseOut]
    total: int


class EvidenceCreate(BaseModel):
    title: str
    content: str = ""
    url: str | None = None
    status: str = "UNVERIFIED"
    source_type: str = "manual"


class EvidenceUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    url: str | None = None
    status: str | None = None


class EvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    title: str
    content: str
    url: str | None
    status: str
    source_type: str
    media: list
    created_at: datetime
    updated_at: datetime


class ScanCreate(BaseModel):
    target: str
    scan_type: str = "spiderfoot"


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    target: str
    scan_type: str
    external_id: str | None
    status: str
    results: dict
    created_at: datetime
    completed_at: datetime | None


# Graph data shapes for vis-network
class GraphNode(BaseModel):
    id: str
    label: str
    type: str  # person / company / domain / ip / phone / email
    properties: dict = {}


class GraphEdge(BaseModel):
    id: str
    from_: str
    to: str
    label: str

    model_config = ConfigDict(populate_by_name=True)


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
