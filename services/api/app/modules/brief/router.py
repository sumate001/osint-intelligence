from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.db import get_db
from ...core.auth import get_current_user
from ...core.rbac import Role, require_role
from .schemas import BriefCreate, BriefUpdate, BriefReview, BriefOut, BriefListItem
from . import service
from .export import export_csv, export_gexf, export_pdf_bytes

router = APIRouter()


@router.post("", response_model=BriefOut, status_code=201)
async def create_brief(
    body: BriefCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    async with db.begin():
        brief = await service.create_brief(db, body, current_user["id"])
    return BriefOut.model_validate(brief)


@router.get("", response_model=list[BriefListItem])
async def list_briefs(
    case_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    briefs = await service.list_briefs(db, case_id=case_id)
    return [BriefListItem.model_validate(b) for b in briefs]


@router.get("/{brief_id}", response_model=BriefOut)
async def get_brief(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    brief = await service.get_brief(db, brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    return BriefOut.model_validate(brief)


@router.patch("/{brief_id}", response_model=BriefOut)
async def update_brief(
    brief_id: str,
    body: BriefUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    async with db.begin():
        brief = await service.get_brief(db, brief_id)
        if not brief:
            raise HTTPException(status_code=404, detail="Brief not found")
        brief = await service.update_brief(db, brief, body)
    return BriefOut.model_validate(brief)


@router.post("/{brief_id}/submit", response_model=BriefOut)
async def submit_brief(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    async with db.begin():
        brief = await service.get_brief(db, brief_id)
        if not brief:
            raise HTTPException(status_code=404, detail="Brief not found")
        brief = await service.submit_for_review(db, brief)
    return BriefOut.model_validate(brief)


@router.post("/{brief_id}/review", response_model=BriefOut)
async def review_brief(
    brief_id: str,
    body: BriefReview,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(Role.EDITOR)),
):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    async with db.begin():
        brief = await service.get_brief(db, brief_id)
        if not brief:
            raise HTTPException(status_code=404, detail="Brief not found")
        brief = await service.review_brief(db, brief, body.action, current_user["id"], body.note)
    return BriefOut.model_validate(brief)


@router.post("/{brief_id}/draft-llm", response_model=BriefOut)
async def draft_with_llm(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    async with db.begin():
        brief = await service.get_brief(db, brief_id)
        if not brief:
            raise HTTPException(status_code=404, detail="Brief not found")
        brief = await service.llm_draft_brief(db, brief)
    return BriefOut.model_validate(brief)


@router.delete("/{brief_id}", status_code=204)
async def delete_brief(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    async with db.begin():
        brief = await service.get_brief(db, brief_id)
        if not brief:
            raise HTTPException(status_code=404, detail="Brief not found")
        await service.delete_brief(db, brief)


# ── Exports ──────────────────────────────────────────────────────────────────

@router.get("/{brief_id}/export/csv")
async def export_csv_endpoint(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    brief = await service.get_brief(db, brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    data = export_csv(brief)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="brief-{brief_id}.csv"'},
    )


@router.get("/{brief_id}/export/gexf")
async def export_gexf_endpoint(
    brief_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    brief = await service.get_brief(db, brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    data = export_gexf(brief)
    return Response(
        content=data,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="brief-{brief_id}.gexf"'},
    )


@router.get("/{brief_id}/export/pdf")
async def export_pdf_endpoint(
    brief_id: str,
    public: bool = False,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    brief = await service.get_brief(db, brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    data = export_pdf_bytes(brief, public_only=public)
    suffix = "public" if public else "internal"
    media = "application/pdf"
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="brief-{brief_id}-{suffix}.pdf"'},
    )
