"""The link at the bottom of every reminder email. docs/plans/scheduled-jobs.md"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.services.reminder_jobs import user_from_off_token

router = APIRouter(prefix="/reminders", tags=["reminders"])


class OffRequest(BaseModel):
    token: str = Field(max_length=200)


@router.post("/off")
async def reminder_emails_off(data: OffRequest, db: AsyncSession = Depends(get_db)):
    """No sign-in, like any unsubscribe link. The signed token says whose reminders to stop, and
    stopping them is all it can do."""
    user_id = user_from_off_token(data.token)
    user = await db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=400, detail="This link isn't valid")
    if user.reminder_emails_off_at is None:
        user.reminder_emails_off_at = datetime.now(timezone.utc)
        await db.commit()
    return {"off": True}
