"""The review link — a reviewer marks generated suggestions without logging in.

`GET /review/{token}` serves a self-contained page; `POST /review/{token}/mark` saves one decision.
Every click is saved as it happens, because the people whose judgement we need should not have to
copy anything back, and will not manage a login.

**The token is the whole of the authentication**, exactly as `/monitor/{access_token}` already
works for the parent monitoring form. That is acceptable here only because these tables hold their
own copy of the text and reference no patient rows: a forwarded link reaches the review items and
nothing else. Do not add a route under this prefix that reads patient data.

Both routes are in the route sweep's PUBLIC list, which is the record of that decision.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.review import ReviewRound, ReviewReviewer, ReviewMark, ReviewAddition
from app.services.review_page import render_page

router = APIRouter(tags=["review-public"])

CHOICES = {"show", "hide"}


class MarkIn(BaseModel):
    item_key: str
    choice: str | None = None      # null clears the mark


class AdditionIn(BaseModel):
    item_key: str
    body: str


async def _reviewer(db: AsyncSession, token: str) -> tuple[ReviewReviewer, ReviewRound]:
    result = await db.execute(select(ReviewReviewer).where(ReviewReviewer.token == token))
    reviewer = result.scalar_one_or_none()
    if reviewer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = await db.execute(select(ReviewRound).where(ReviewRound.id == reviewer.round_id))
    round_ = result.scalar_one_or_none()
    if round_ is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return reviewer, round_


@router.get("/review/{token}", response_class=HTMLResponse)
async def review_page(token: str, db: AsyncSession = Depends(get_db)):
    reviewer, round_ = await _reviewer(db, token)
    result = await db.execute(select(ReviewMark).where(ReviewMark.reviewer_id == reviewer.id))
    marks = {m.item_key: m.choice for m in result.scalars().all()}

    result = await db.execute(
        select(ReviewAddition)
        .where(ReviewAddition.reviewer_id == reviewer.id)
        .order_by(ReviewAddition.created_at)
    )
    additions: dict[str, list] = {}
    for a in result.scalars().all():
        additions.setdefault(a.item_key, []).append({"id": str(a.id), "body": a.body})

    reviewer.last_seen_at = datetime.now(timezone.utc)
    await db.commit()

    return HTMLResponse(render_page(round_, reviewer, marks, token, additions))


@router.post("/review/{token}/mark", status_code=status.HTTP_204_NO_CONTENT)
async def save_mark(token: str, data: MarkIn, db: AsyncSession = Depends(get_db)):
    reviewer, _ = await _reviewer(db, token)

    if data.choice is not None and data.choice not in CHOICES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown choice")

    result = await db.execute(
        select(ReviewMark).where(
            ReviewMark.reviewer_id == reviewer.id,
            ReviewMark.item_key == data.item_key,
        )
    )
    existing = result.scalar_one_or_none()

    if data.choice is None:
        if existing is not None:
            await db.delete(existing)
    elif existing is not None:
        existing.choice = data.choice
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(ReviewMark(
            reviewer_id=reviewer.id, item_key=data.item_key, choice=data.choice
        ))

    await db.commit()


MAX_ADDITION = 400


@router.post("/review/{token}/add", status_code=status.HTTP_201_CREATED)
async def add_suggestion(token: str, data: AdditionIn, db: AsyncSession = Depends(get_db)):
    """A suggestion the reviewer wrote herself.

    Marking ours says what is wrong; writing her own says what right looks like. Capped in length
    because this is one line on a ladder, not a note.
    """
    reviewer, _ = await _reviewer(db, token)

    body = (data.body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to add")
    if len(body) > MAX_ADDITION:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too long")

    addition = ReviewAddition(reviewer_id=reviewer.id, item_key=data.item_key, body=body)
    db.add(addition)
    await db.commit()
    await db.refresh(addition)
    return {"id": str(addition.id), "body": addition.body}


@router.delete("/review/{token}/add/{addition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_suggestion(
    token: str, addition_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    """Only her own. The token identifies the reviewer, so the filter is what enforces it."""
    reviewer, _ = await _reviewer(db, token)
    result = await db.execute(
        select(ReviewAddition).where(
            ReviewAddition.id == addition_id,
            ReviewAddition.reviewer_id == reviewer.id,
        )
    )
    addition = result.scalar_one_or_none()
    if addition is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await db.delete(addition)
    await db.commit()
