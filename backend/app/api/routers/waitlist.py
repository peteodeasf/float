import uuid
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.waitlist import WaitlistEntry
from app.api.routers.admin import get_admin_context


router = APIRouter(tags=["waitlist"])


class WaitlistSubmission(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    role: Literal["clinician", "parent", "other"]
    # Anti-bot. `company` is a honeypot: hidden from people, so a value means a bot filled it.
    # `elapsed_ms` is how long the form was on screen — bots submit near-instantly.
    company: str = ""
    elapsed_ms: int | None = None


# A real person takes longer than this to fill the form; a submission faster than it is a bot.
MIN_FILL_MS = 2000


@router.post("")
async def submit_waitlist(
    submission: WaitlistSubmission,
    db: AsyncSession = Depends(get_db),
):
    # Drop bots silently — return success so they get no signal to adapt, but save nothing.
    if submission.company.strip() or (submission.elapsed_ms is not None and submission.elapsed_ms < MIN_FILL_MS):
        return {"success": True}

    entry = WaitlistEntry(
        first_name=submission.first_name.strip(),
        last_name=submission.last_name.strip(),
        email=submission.email.lower().strip(),
        role=submission.role,
    )
    db.add(entry)
    await db.commit()
    return {"success": True}


@router.get("")
async def list_waitlist_entries(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WaitlistEntry).order_by(WaitlistEntry.created_at.desc())
    )
    entries = result.scalars().all()
    return _entries_out(entries)


@router.delete("/{entry_id}")
async def delete_waitlist_entry(
    entry_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Remove a waitlist entry — for clearing out spam that gets past the honeypot."""
    entry = await db.get(WaitlistEntry, entry_id)
    if entry is not None:
        await db.delete(entry)
        await db.commit()
    return {"success": True}


def _entries_out(entries) -> list[dict]:
    return [
        {
            "id": str(e.id),
            "first_name": e.first_name,
            "last_name": e.last_name,
            "email": e.email,
            "role": e.role,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]
