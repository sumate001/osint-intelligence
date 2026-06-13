from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class EEI(BaseModel):
    id: str
    question: str
    answered: bool = False


class PIRCreate(BaseModel):
    question: str
    priority: str = "P2"
    deadline: datetime | None = None
    eei_list: list[EEI] = []
    assigned_to: str | None = None
    notes: str | None = None


class PIRUpdate(BaseModel):
    question: str | None = None
    priority: str | None = None
    status: str | None = None
    deadline: datetime | None = None
    eei_list: list[EEI] | None = None
    notes: str | None = None


class PIROut(BaseModel):
    id: str
    question: str
    priority: str
    status: str
    deadline: datetime | None
    eei_list: list[EEI]
    progress: int
    assigned_to: str | None
    notes: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
