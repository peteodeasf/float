"""The Feedback link at the top right of every clinician page. docs/plans/clinician-feedback-link.md"""
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.patients import get_practitioner_context
from app.core.database import get_db, get_session_factory
from app.models.feedback import ClinicianFeedback
from app.services import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])

MAX_LENGTH = 5000
#: Each one becomes a GitHub issue, so a stuck script cannot fill the repository.
PER_HOUR = 10
#: A page path as the app sends it. Anything else (a newline, a full address) is dropped, so it
#: cannot add lines to the issue.
PAGE_PATH = re.compile(r"/[A-Za-z0-9/_.\-]*")


class FeedbackIn(BaseModel):
    body: str = Field(max_length=MAX_LENGTH)
    #: The page's path, e.g. /patients/<id>. Anything else is dropped.
    page: str = Field(default="", max_length=500)


async def _send_after_response(sessions, feedback_id: uuid.UUID) -> None:
    async with sessions() as db:
        await feedback_service.send(db, feedback_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def send_feedback(
    payload: FeedbackIn,
    background_tasks: BackgroundTasks,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
):
    user, _ = context
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Write something first.")
    page = payload.page if PAGE_PATH.fullmatch(payload.page) and not payload.page.startswith("//") else ""
    recent = (await db.execute(
        select(func.count()).select_from(ClinicianFeedback).where(
            ClinicianFeedback.user_id == user.id,
            ClinicianFeedback.created_at > datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )).scalar_one()
    if recent >= PER_HOUR:
        raise HTTPException(status_code=429, detail="That's a lot of feedback in an hour. Try again later.")
    feedback = await feedback_service.save(db, user.id, body, page)
    # Straight to GitHub once the clinician has their answer. If it fails, the scheduled job retries.
    background_tasks.add_task(_send_after_response, sessions, feedback.id)
    return {"id": str(feedback.id)}
