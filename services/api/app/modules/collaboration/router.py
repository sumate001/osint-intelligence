from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.db import get_db
from ...core.auth import get_current_user
from .schemas import CommentCreate, CommentOut, ActivityOut
from . import service

router = APIRouter()


@router.get("/cases/{case_id}/activity", response_model=list[ActivityOut])
async def get_activity(case_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    activities = await service.get_activity(db, case_id)
    return [ActivityOut.model_validate(a) for a in activities]


@router.get("/evidence/{evidence_id}/comments", response_model=list[CommentOut])
async def get_comments(evidence_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    comments = await service.get_comments(db, evidence_id)
    return [CommentOut.model_validate(c) for c in comments]


@router.post("/evidence/{evidence_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    evidence_id: str,
    body: CommentCreate,
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    async with db.begin():
        comment = await service.add_comment(
            db, evidence_id, case_id, body,
            author_id=current_user["id"], author_name=current_user.get("email", current_user["id"]),
        )
        await service.log_activity(
            db, case_id, "comment_added", current_user["id"],
            current_user.get("email", "unknown"),
            f"comment ({'dissent' if body.is_dissent else 'note'}) บน evidence {evidence_id[:8]}",
            entity_id=evidence_id,
        )
    return CommentOut.model_validate(comment)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(comment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from sqlalchemy import select
    from .models import EvidenceComment
    async with db.begin():
        result = await db.execute(select(EvidenceComment).where(EvidenceComment.id == comment_id))
        comment = result.scalar_one_or_none()
        if not comment:
            raise HTTPException(404, "Comment not found")
        if comment.author_id != current_user["id"] and current_user.get("role") not in ("admin", "editor"):
            raise HTTPException(403, "Not allowed")
        await service.delete_comment(db, comment)
