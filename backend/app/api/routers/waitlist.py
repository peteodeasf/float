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


@router.post("")
async def submit_waitlist(
    submission: WaitlistSubmission,
    db: AsyncSession = Depends(get_db),
):
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
