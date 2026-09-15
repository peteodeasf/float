"""Reading a review round's answers: every item, how each reviewer marked it, what they added and
wrote. Float admins only.

The review link (routers/review.py) only ever shows a reviewer their own marks. This is the other
side, so reading Dr. Walker's answers no longer means querying the database by hand. Reviewer
tokens are never returned: holding one is the same as being that reviewer.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import get_admin_context
from app.core.database import get_db
from app.models.review import ReviewAddition, ReviewComment, ReviewMark, ReviewReviewer, ReviewRound
from app.models.user import User
from app.services.review_page import allowed_choices

router = APIRouter(prefix="/admin/review-rounds", tags=["admin"])


@router.get("")
async def list_rounds(
    _admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    rounds = (await db.execute(select(ReviewRound).order_by(ReviewRound.created_at.desc()))).scalars().all()
    reviewers = (await db.execute(select(ReviewReviewer))).scalars().all()
    marked = dict((await db.execute(
        select(ReviewMark.reviewer_id, func.count()).group_by(ReviewMark.reviewer_id)
    )).all())
    out = []
    for r in rounds:
        out.append({
            "id": str(r.id),
            "slug": r.slug,
            "title": r.title,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "to_mark": len(allowed_choices(r.items)),
            "reviewers": [
                {"name": v.name, "marked": marked.get(v.id, 0),
                 "last_seen_at": v.last_seen_at.isoformat() if v.last_seen_at else None}
                for v in reviewers if v.round_id == r.id
            ],
        })
    return out


@router.get("/{round_id}")
async def get_round(
    round_id: uuid.UUID,
    _admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(ReviewRound, round_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    reviewers = (await db.execute(
        select(ReviewReviewer).where(ReviewReviewer.round_id == r.id).order_by(ReviewReviewer.created_at)
    )).scalars().all()
    ids = [v.id for v in reviewers]

    marks: dict[str, dict[str, str]] = {str(i): {} for i in ids}
    additions: dict[str, dict[str, list[str]]] = {str(i): {} for i in ids}
    comments: dict[str, dict[str, str]] = {str(i): {} for i in ids}
    if ids:
        for m in (await db.execute(select(ReviewMark).where(ReviewMark.reviewer_id.in_(ids)))).scalars():
            marks[str(m.reviewer_id)][m.item_key] = m.choice
        for a in (await db.execute(
            select(ReviewAddition).where(ReviewAddition.reviewer_id.in_(ids)).order_by(ReviewAddition.created_at)
        )).scalars():
            additions[str(a.reviewer_id)].setdefault(a.item_key, []).append(a.body)
        for c in (await db.execute(select(ReviewComment).where(ReviewComment.reviewer_id.in_(ids)))).scalars():
            comments[str(c.reviewer_id)][c.item_key] = c.body

    return {
        "id": str(r.id),
        "slug": r.slug,
        "title": r.title,
        "items": r.items,
        "reviewers": [
            {"id": str(v.id), "name": v.name,
             "last_seen_at": v.last_seen_at.isoformat() if v.last_seen_at else None}
            for v in reviewers
        ],
        "marks": marks,
        "additions": additions,
        "comments": comments,
    }
