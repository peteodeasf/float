"""Request access: how a practice asks to use Float, and how Float answers.

Not the waitlist. docs/plans/clinician-practice-onboarding.md, steps 4 and 7.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import get_admin_context
from app.core.config import settings
from app.core.database import get_db
from app.models.practice import AccessRequest
from app.models.user import User
from app.services import practice_service

router = APIRouter(tags=["access-requests"])

# Per day. Past these the form still says "thanks", and nothing is saved or sent.
MAX_PER_EMAIL = 3
MAX_PER_IP = 10


class AccessRequestIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    role: Literal["clinician", "practice_manager"]
    credentials: str | None = Field(default=None, max_length=200)
    practice_name: str = Field(min_length=1, max_length=200)
    state: str = Field(min_length=1, max_length=50)
    practice_size: int = Field(ge=1, le=10000)


def _client_ip(request: Request) -> str | None:
    # Railway puts the real address first in X-Forwarded-For. Only used to limit requests.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def _over_limit(db: AsyncSession, email: str, ip: str | None) -> bool:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = select(func.count(AccessRequest.id)).where(AccessRequest.created_at > since)
    if (await db.execute(recent.where(AccessRequest.email == email))).scalar() >= MAX_PER_EMAIL:
        return True
    return bool(ip) and (await db.execute(recent.where(AccessRequest.ip_address == ip))).scalar() >= MAX_PER_IP


@router.post("/access-requests")
async def submit_access_request(
    data: AccessRequestIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Always the same answer, whether or not the email already has an account, so the form cannot
    be used to find out who uses Float."""
    email = data.email.lower().strip()
    ip = _client_ip(request)
    if await _over_limit(db, email, ip):
        return {"success": True}

    role = practice_service.CLINICIAN if data.role == "clinician" else practice_service.PRACTICE_MANAGER
    access_request = AccessRequest(
        name=data.name.strip(),
        email=email,
        role=role,
        credentials=(data.credentials or "").strip() or None,
        practice_name=data.practice_name.strip(),
        state=data.state.strip(),
        practice_size=data.practice_size,
        ip_address=ip,
    )
    db.add(access_request)
    await db.commit()

    # Self-serve: approve it now. An email that already has an account is left for Float to see.
    if settings.PRACTICE_SIGNUP_MODE == "open" and not await practice_service.email_in_use(db, email):
        await practice_service.approve_request(db, access_request, reviewed_by_user_id=None)
    return {"success": True}


def _out(r: AccessRequest) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "email": r.email,
        "role": r.role,
        "credentials": r.credentials,
        "practice_name": r.practice_name,
        "state": r.state,
        "practice_size": r.practice_size,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    }


@router.get("/admin/access-requests")
async def list_access_requests(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AccessRequest).order_by(AccessRequest.created_at.desc())
    )).scalars().all()
    return [_out(r) for r in rows]


async def _get_request(db: AsyncSession, request_id: uuid.UUID) -> AccessRequest:
    r = await db.get(AccessRequest, request_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return r


@router.post("/admin/access-requests/{request_id}/approve")
async def approve_access_request(
    request_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    r = await _get_request(db, request_id)
    org = await practice_service.approve_request(db, r, reviewed_by_user_id=admin.id)
    return {"success": True, "organization_id": str(org.id)}


@router.post("/admin/access-requests/{request_id}/decline")
async def decline_access_request(
    request_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Nothing is sent to the person. Float can contact them if it wants to."""
    r = await _get_request(db, request_id)
    if r.status != "new":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This request has already been dealt with.")
    r.status = "declined"
    r.reviewed_at = datetime.now(timezone.utc)
    r.reviewed_by_user_id = admin.id
    await db.commit()
    return {"success": True}
