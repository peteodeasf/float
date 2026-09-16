"""The practice screens: who is in the practice, and for an office manager, who has which patient.

Every route is scoped to the caller's own practice. A practice admin (a clinician admin or an office
manager) manages the people. Only an office manager uses the patient routes, and those return names
and clinicians, never a record.

docs/plans/clinician-practice-onboarding.md, steps 5 and 6.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.patient import PatientAccessGrant, PatientProfile, PractitionerProfile
from app.models.practice import PracticeManagerProfile
from app.models.user import User, UserRole
from app.services import patient_access_service, practice_service, setup_link_service
from app.services.practice_service import Membership

router = APIRouter(prefix="/practice", tags=["practice"])

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def get_member(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Membership:
    membership = await practice_service.membership_of(db, current_user)
    practice_service.require_ready(current_user, membership.organization)
    return membership


async def get_practice_admin(m: Membership = Depends(get_member)) -> Membership:
    if not m.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only a practice admin can do this.")
    return m


async def get_practice_manager(m: Membership = Depends(get_member)) -> Membership:
    if not m.is_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only an office manager can do this.")
    return m


@router.get("")
async def read_practice(m: Membership = Depends(get_member)):
    return {
        "name": m.organization.name,
        "me": {"name": m.name, "email": m.user.email, "is_admin": m.is_admin, "is_manager": m.is_manager},
    }


# ── People ────────────────────────────────────────────────────────────────────

async def _members(db: AsyncSession, organization_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(User, UserRole, PractitionerProfile.name, PracticeManagerProfile.name)
        .join(UserRole, UserRole.user_id == User.id)
        .outerjoin(PractitionerProfile, PractitionerProfile.user_id == User.id)
        .outerjoin(PracticeManagerProfile, PracticeManagerProfile.user_id == User.id)
        .where(
            UserRole.organization_id == organization_id,
            UserRole.role.in_(practice_service.PRACTICE_ROLES),
        )
    )).all()
    out = []
    for user, role, clinician_name, manager_name in rows:
        if user.deactivated_at is not None:
            state = "removed"
        elif user.setup_completed_at is None:
            state = "invited"
        else:
            state = "active"
        out.append({
            "user_id": str(user.id),
            "name": clinician_name or manager_name or "",
            "email": user.email,
            "role": "practice_manager" if role.role == practice_service.PRACTICE_MANAGER else "clinician",
            "is_admin": bool(role.is_org_admin),
            "status": state,
            # Chosen a password yet. Until they have, a new setup link can be sent.
            "can_resend_link": practice_service.awaiting_first_password(user),
        })
    order = {"active": 0, "invited": 1, "removed": 2}
    return sorted(out, key=lambda r: (order[r["status"]], r["name"].lower(), r["email"]))


async def _member_of_my_practice(db: AsyncSession, m: Membership, user_id: uuid.UUID) -> tuple[User, UserRole]:
    row = (await db.execute(
        select(User, UserRole).join(UserRole, UserRole.user_id == User.id).where(
            User.id == user_id,
            UserRole.organization_id == m.organization.id,
            UserRole.role.in_(practice_service.PRACTICE_ROLES),
        )
    )).first()
    if row is None:
        raise NOT_FOUND
    return row[0], row[1]


async def _active_admin_count(db: AsyncSession, organization_id: uuid.UUID) -> int:
    rows = (await db.execute(
        select(User.id).join(UserRole, UserRole.user_id == User.id).where(
            UserRole.organization_id == organization_id,
            UserRole.role.in_(practice_service.PRACTICE_ROLES),
            UserRole.is_org_admin.is_(True),
            User.deactivated_at.is_(None),
        )
    )).all()
    return len(rows)


async def _send_colleague_link(db: AsyncSession, m: Membership, user: User) -> None:
    await practice_service.send_setup_link(
        db, user, m.organization.id, purpose="colleague",
        intro=f"{m.name or 'Your practice'} has invited you to join {m.organization.name} on Float.",
        created_by_user_id=m.user.id,
    )


@router.get("/members")
async def list_members(m: Membership = Depends(get_practice_admin), db: AsyncSession = Depends(get_db)):
    return await _members(db, m.organization.id)


class InviteIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    role: Literal["clinician", "practice_manager"]


@router.post("/members", status_code=status.HTTP_201_CREATED)
async def invite_member(
    data: InviteIn,
    m: Membership = Depends(get_practice_admin),
    db: AsyncSession = Depends(get_db),
):
    email = data.email.lower().strip()
    if await practice_service.email_in_use(db, email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Someone with this email already has a Float account.")
    is_manager = data.role == "practice_manager"
    user, _ = await practice_service.create_member(
        db, m.organization.id, email, data.name.strip(),
        practice_service.PRACTICE_MANAGER if is_manager else practice_service.CLINICIAN,
        # An office manager is there to run the practice, so is always one of its admins.
        is_admin=is_manager,
    )
    await _send_colleague_link(db, m, user)
    return {"user_id": str(user.id)}


@router.post("/members/{user_id}/setup-link")
async def resend_member_setup_link(
    user_id: uuid.UUID,
    m: Membership = Depends(get_practice_admin),
    db: AsyncSession = Depends(get_db),
):
    user, _ = await _member_of_my_practice(db, m, user_id)
    if not practice_service.awaiting_first_password(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="They have already set up their account.")
    await _send_colleague_link(db, m, user)
    return {"success": True}


class AdminIn(BaseModel):
    is_admin: bool


@router.put("/members/{user_id}/admin")
async def set_member_admin(
    user_id: uuid.UUID,
    data: AdminIn,
    m: Membership = Depends(get_practice_admin),
    db: AsyncSession = Depends(get_db),
):
    user, role = await _member_of_my_practice(db, m, user_id)
    if user.deactivated_at is not None:
        raise NOT_FOUND
    if role.role == practice_service.PRACTICE_MANAGER:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="An office manager is always a practice admin.")
    if not data.is_admin and role.is_org_admin and await _active_admin_count(db, m.organization.id) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A practice needs at least one admin. Make someone else an admin first.")
    role.is_org_admin = data.is_admin
    await db.commit()
    return {"user_id": str(user.id), "is_admin": data.is_admin}


@router.delete("/members/{user_id}")
async def remove_member(
    user_id: uuid.UUID,
    m: Membership = Depends(get_practice_admin),
    db: AsyncSession = Depends(get_db),
):
    """Their account stops working. Nothing is deleted: their patients stay in the practice, and
    someone gives another clinician access to them."""
    if user_id == m.user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You can't remove yourself.")
    user, _ = await _member_of_my_practice(db, m, user_id)
    if user.deactivated_at is None:
        now = datetime.now(timezone.utc)
        user.deactivated_at = now
        await setup_link_service.revoke_unused(db, user.id)
        await db.commit()
    return {"success": True}


# ── Patients, for an office manager ───────────────────────────────────────────

@router.get("/patients")
async def list_practice_patients(
    request: Request,
    m: Membership = Depends(get_practice_manager),
    db: AsyncSession = Depends(get_db),
):
    """Each patient's name, their own clinician, and who else has access. No clinical data.

    Each patient shown is written to the access log, so a patient asking who saw their name gets
    the office manager in the answer."""
    patients = (await db.execute(
        select(PatientProfile)
        .where(PatientProfile.organization_id == m.organization.id)
        .order_by(PatientProfile.name)
    )).scalars().all()
    grants = (await db.execute(
        select(PatientAccessGrant.patient_id, PractitionerProfile.id, PractitionerProfile.name)
        .join(PractitionerProfile, PractitionerProfile.id == PatientAccessGrant.practitioner_id)
        .where(
            PatientAccessGrant.organization_id == m.organization.id,
            PatientAccessGrant.revoked_at.is_(None),
        )
    )).all()
    by_patient: dict[uuid.UUID, list[dict]] = {}
    for patient_id, practitioner_id, name in grants:
        by_patient.setdefault(patient_id, []).append({"practitioner_id": str(practitioner_id), "name": name})

    out = []
    for p in patients:
        clinicians = by_patient.get(p.id, [])
        owner = next((c for c in clinicians if c["practitioner_id"] == str(p.primary_practitioner_id)), None)
        out.append({
            "patient_id": str(p.id),
            "name": p.name,
            "closed": p.closed_at is not None,
            "clinician": owner,
            "others_with_access": [c for c in clinicians if c is not owner],
        })
    await patient_access_service.record_access(db, list(patients), m.user.id, None, "practice_manager", request)
    return out


@router.get("/clinicians")
async def list_practice_clinicians(m: Membership = Depends(get_practice_manager), db: AsyncSession = Depends(get_db)):
    """Clinicians a patient can be given to: set up and not removed."""
    rows = (await db.execute(
        select(PractitionerProfile.id, PractitionerProfile.name)
        .join(User, User.id == PractitionerProfile.user_id)
        .where(
            PractitionerProfile.organization_id == m.organization.id,
            User.deactivated_at.is_(None),
            User.setup_completed_at.is_not(None),
        )
        .order_by(PractitionerProfile.name)
    )).all()
    return [{"practitioner_id": str(pid), "name": name} for pid, name in rows]


async def _patient_of_my_practice(db: AsyncSession, m: Membership, patient_id: uuid.UUID) -> PatientProfile:
    patient = await db.get(PatientProfile, patient_id)
    if patient is None or patient.organization_id != m.organization.id:
        raise NOT_FOUND
    return patient


class ClinicianIn(BaseModel):
    practitioner_id: uuid.UUID


@router.put("/patients/{patient_id}/clinician")
async def set_patient_clinician(
    patient_id: uuid.UUID,
    data: ClinicianIn,
    request: Request,
    m: Membership = Depends(get_practice_manager),
    db: AsyncSession = Depends(get_db),
):
    """Make a clinician this patient's own clinician: what a practice does when one leaves."""
    patient = await _patient_of_my_practice(db, m, patient_id)
    await patient_access_service.manager_set_owner(db, patient, data.practitioner_id, m.user.id, request)
    return {"success": True}
