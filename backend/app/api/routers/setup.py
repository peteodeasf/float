"""The setup screens a new clinician or office manager goes through before using Float.

Every route here acts on the signed-in person and their own practice; none takes an id.
docs/plans/clinician-practice-onboarding.md
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import agreements
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.practice import AgreementAcceptance
from app.models.user import User
from app.services import practice_service
from app.services.practice_service import Membership

router = APIRouter(prefix="/setup", tags=["setup"])


async def get_setup_membership(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Membership:
    membership = await practice_service.membership_of(db, current_user)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a practice member")
    if membership.organization.status == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=practice_service.PRACTICE_NOT_ACTIVE)
    return membership


def _state(m: Membership) -> dict:
    profile = m.practitioner or m.manager
    return {
        "role": "practice_manager" if m.is_manager else "clinician",
        "is_practice_owner": m.is_practice_owner,
        "steps": practice_service.steps_for(m),
        "steps_done": list(m.user.setup_steps_done or []),
        "next_step": practice_service.next_step(m),
        "setup_complete": m.user.setup_completed_at is not None,
        "email": m.user.email,
        "details": {
            "name": profile.name if profile else "",
            "credentials": m.practitioner.credentials if m.practitioner else None,
            "phone_number": profile.phone_number if profile else None,
        },
        "practice": {
            "name": m.organization.name,
            "state": m.organization.state,
            "phone": m.organization.phone,
        },
    }


def _require_setup_open(m: Membership) -> None:
    """Setup screens are for setting up. Afterwards, the same details change in Settings."""
    if m.user.setup_completed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup is already finished.")


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.get("")
async def read_setup_state(m: Membership = Depends(get_setup_membership)):
    return _state(m)


class DetailsIn(BaseModel):
    name: str = Field(max_length=200)
    credentials: str | None = Field(default=None, max_length=200)
    phone_number: str | None = Field(default=None, max_length=50)


@router.put("/details")
async def save_details(
    data: DetailsIn,
    m: Membership = Depends(get_setup_membership),
    db: AsyncSession = Depends(get_db),
):
    _require_setup_open(m)
    name = _clean(data.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter your name.")
    profile = m.practitioner or m.manager
    profile.name = name
    profile.phone_number = _clean(data.phone_number)
    if m.practitioner:
        # An office manager is not asked for credentials.
        m.practitioner.credentials = _clean(data.credentials)
    practice_service.mark_step_done(m, "details")
    await db.commit()
    return _state(m)


class PracticeIn(BaseModel):
    name: str = Field(max_length=200)
    state: str = Field(max_length=50)
    phone: str | None = Field(default=None, max_length=50)


@router.put("/practice")
async def save_practice(
    data: PracticeIn,
    m: Membership = Depends(get_setup_membership),
    db: AsyncSession = Depends(get_db),
):
    _require_setup_open(m)
    if not m.is_practice_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the person setting up the practice can change this.")
    name, state = _clean(data.name), _clean(data.state)
    if not name or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Please enter the practice name and state.")
    m.organization.name = name
    m.organization.state = state
    m.organization.phone = _clean(data.phone)
    practice_service.mark_step_done(m, "practice")
    await db.commit()
    return _state(m)


@router.get("/agreements")
async def read_agreements(m: Membership = Depends(get_setup_membership)):
    return [
        {"document": a.document, "version": a.version, "title": a.title, "body": a.body}
        for a in agreements.required_for(m.is_practice_owner)
    ]


class AcceptedDocument(BaseModel):
    document: str
    version: str


class AgreementsIn(BaseModel):
    accepted: list[AcceptedDocument]
    # The person setting up the practice confirms they may sign the BAA on its behalf.
    authorized_to_sign: bool = False


@router.post("/agreements")
async def accept_agreements(
    data: AgreementsIn,
    m: Membership = Depends(get_setup_membership),
    db: AsyncSession = Depends(get_db),
):
    _require_setup_open(m)
    # The agreements come last, so everything before them has to be done first.
    if practice_service.next_step(m) != "agreements":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Finish the earlier setup screens first.")

    accepted = {(d.document, d.version) for d in data.accepted}
    required = agreements.required_for(m.is_practice_owner)
    # The version is part of what is accepted: text that changed since the page loaded has not
    # been agreed to.
    if any((a.document, a.version) not in accepted for a in required):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Please accept each agreement. If you just reloaded, check the latest text.")
    if m.is_practice_owner and not data.authorized_to_sign:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Please confirm you can sign for your practice.")

    for a in required:
        db.add(AgreementAcceptance(
            organization_id=m.organization.id,
            user_id=m.user.id,
            user_email=m.user.email,
            document=a.document,
            version=a.version,
        ))
    practice_service.mark_step_done(m, "agreements")
    await db.commit()
    return _state(m)
