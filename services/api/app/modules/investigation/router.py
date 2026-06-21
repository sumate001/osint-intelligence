import uuid
from fastapi import APIRouter, Depends, HTTPException, Query

from ...core.db import get_db
from ...core.auth import get_current_user
from ...core.rbac import require_role, Role
from .schemas import (
    CaseCreate, CaseUpdate, CaseOut, CaseListOut,
    EvidenceCreate, EvidenceUpdate, EvidenceOut,
    ScanCreate, ScanOut, GraphOut,
)
from . import service
from .neo4j import get_case_graph
from .tasks import run_spiderfoot_scan

router = APIRouter()


@router.post("/cases", response_model=CaseOut, status_code=201)
async def create_case(
    data: CaseCreate,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    case = await service.create_case(db, data, user_id=current_user["id"])
    return case


@router.get("/cases", response_model=CaseListOut)
async def list_cases(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    items, total = await service.list_cases(db, status=status, page=page, page_size=page_size)
    return CaseListOut(items=items, total=total)


@router.get("/cases/{case_id}", response_model=CaseOut)
async def get_case(
    case_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    case = await service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/cases/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: uuid.UUID,
    data: CaseUpdate,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    case = await service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return await service.update_case(db, case, data)


@router.delete("/cases/{case_id}", status_code=204)
async def delete_case(
    case_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(require_role(Role.ADMIN)),
):
    case = await service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    await service.delete_case(db, case)


# Evidence endpoints

@router.post("/cases/{case_id}/evidence", response_model=EvidenceOut, status_code=201)
async def add_evidence(
    case_id: uuid.UUID,
    data: EvidenceCreate,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    case = await service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    ev = await service.add_evidence(db, case_id, data)
    from ...modules.requirements.tasks import match_pir_task
    match_pir_task.delay(ev.title, ev.content or "", source="evidence")
    return ev


@router.get("/cases/{case_id}/evidence", response_model=list[EvidenceOut])
async def list_evidence(
    case_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.list_evidence(db, case_id)


@router.patch("/cases/{case_id}/evidence/{evidence_id}", response_model=EvidenceOut)
async def update_evidence(
    case_id: uuid.UUID,
    evidence_id: uuid.UUID,
    data: EvidenceUpdate,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    ev = await service.get_evidence(db, evidence_id)
    if not ev or ev.case_id != case_id:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return await service.update_evidence(db, ev, data)


@router.delete("/cases/{case_id}/evidence/{evidence_id}", status_code=204)
async def delete_evidence(
    case_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    ev = await service.get_evidence(db, evidence_id)
    if not ev or ev.case_id != case_id:
        raise HTTPException(status_code=404, detail="Evidence not found")
    await service.delete_evidence(db, ev)


# SpiderFoot scan endpoints

@router.post("/cases/{case_id}/scans", response_model=ScanOut, status_code=201)
async def trigger_scan(
    case_id: uuid.UUID,
    data: ScanCreate,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    case = await service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    scan = await service.create_scan(db, case_id, data)
    await db.flush()
    # Dispatch Celery task and store task_id in results for later cancellation
    task = run_spiderfoot_scan.delay(str(scan.id))
    scan.results = {"celery_task_id": task.id}
    return scan


@router.get("/cases/{case_id}/scans", response_model=list[ScanOut])
async def list_scans(
    case_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    return await service.list_scans(db, case_id)


@router.post("/cases/{case_id}/scans/{scan_id}/cancel", response_model=ScanOut)
async def cancel_scan(
    case_id: uuid.UUID,
    scan_id: uuid.UUID,
    db=Depends(get_db),
    _: dict = Depends(get_current_user),
):
    scan = await service.get_scan(db, scan_id)
    if not scan or str(scan.case_id) != str(case_id):
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in ("PENDING", "RUNNING"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel scan with status {scan.status}")
    scan = await service.cancel_scan(db, scan)
    return scan


@router.get("/cases/{case_id}/graph", response_model=GraphOut)
async def get_graph(
    case_id: uuid.UUID,
    _: dict = Depends(get_current_user),
):
    data = await get_case_graph(str(case_id))
    return GraphOut(**data)
