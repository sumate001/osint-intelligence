from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class ConfidenceSet(BaseModel):
    level: str  # HIGH | MEDIUM | LOW
    rationale: str | None = None
    dissent: str | None = None


class ConfidenceOut(BaseModel):
    id: str
    brief_id: str
    level: str
    rationale: str | None
    dissent: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvidenceEntry(BaseModel):
    evidence_id: str
    text: str
    consistency: str  # CONSISTENT | INCONSISTENT | NEUTRAL | NA


class ACHCreate(BaseModel):
    hypothesis: str
    evidence_matrix: list[EvidenceEntry] = []
    likelihood: str = "LIKELY"


class ACHOut(BaseModel):
    id: str
    brief_id: str
    hypothesis: str
    evidence_matrix: list[EvidenceEntry]
    likelihood: str
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
