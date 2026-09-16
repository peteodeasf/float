"""Practices and the people in them: the setup gate, setup progress, and creating accounts.

docs/plans/clinician-practice-onboarding.md
"""
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.organization import Organization
from app.models.patient import PractitionerProfile
from app.models.practice import PracticeManagerProfile
from app.models.user import User, UserRole
from app.services import checklist_item_service, setup_link_service
from app.services.email_service import send_setup_email

CLINICIAN = "practitioner"
PRACTICE_MANAGER = "practice_manager"
PRACTICE_ROLES = (CLINICIAN, PRACTICE_MANAGER)


# ── The gate ──────────────────────────────────────────────────────────────────
# The `detail` strings are read by the clinician app to decide where to send someone.

SETUP_INCOMPLETE = "setup_incomplete"
PRACTICE_NOT_ACTIVE = "practice_not_active"


async def require_ready(db: AsyncSession, user: User, organization_id: uuid.UUID) -> None:
    """Refuse anyone who has not finished setup, or whose practice is not active.

    Called from get_practitioner_context, from get_patient_for_practitioner, and from every
    practice endpoint, so no clinician or manager route can be reached around it.
    """
    if user.setup_completed_at is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SETUP_INCOMPLETE)
    org_status = (await db.execute(
        select(Organization.status).where(Organization.id == organization_id)
    )).scalar_one_or_none()
    if org_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PRACTICE_NOT_ACTIVE)


# ── Who someone is in their practice ──────────────────────────────────────────

@dataclass
class Membership:
    user: User
    role: UserRole
    organization: Organization
    practitioner: PractitionerProfile | None
    manager: PracticeManagerProfile | None

    @property
    def is_admin(self) -> bool:
        return bool(self.role.is_org_admin)

    @property
    def is_manager(self) -> bool:
        return self.role.role == PRACTICE_MANAGER

    @property
    def name(self) -> str:
        profile = self.practitioner or self.manager
        return profile.name if profile else ""

    @property
    def is_practice_owner(self) -> bool:
        """The person setting the practice up. Once it is active, there is no owner step left."""
        return self.is_admin and self.organization.status == "setting_up"


async def membership_of(db: AsyncSession, user: User) -> Membership | None:
    """The practice this clinician or office manager belongs to. None for anyone else."""
    role = (await db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role.in_(PRACTICE_ROLES))
    )).scalars().first()
    if role is None:
        return None
    org = await db.get(Organization, role.organization_id)
    practitioner = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.user_id == user.id)
    )).scalar_one_or_none()
    manager = (await db.execute(
        select(PracticeManagerProfile).where(PracticeManagerProfile.user_id == user.id)
    )).scalar_one_or_none()
    return Membership(user, role, org, practitioner, manager)


# ── Setup progress ────────────────────────────────────────────────────────────

def steps_for(membership: Membership) -> list[str]:
    """The setup screens, in order. The practice screen is only for the person setting it up."""
    if membership.is_practice_owner:
        return ["details", "practice", "agreements"]
    return ["details", "agreements"]


def next_step(membership: Membership) -> str | None:
    done = set(membership.user.setup_steps_done or [])
    return next((s for s in steps_for(membership) if s not in done), None)


def mark_step_done(membership: Membership, step: str) -> None:
    """Record a finished screen. Finishing the last one finishes setup, and for the person setting
    up the practice, makes the practice active."""
    user = membership.user
    if step not in user.setup_steps_done:
        # A new list, so SQLAlchemy sees the change to the JSON column.
        user.setup_steps_done = [*user.setup_steps_done, step]
    if next_step(membership) is None and user.setup_completed_at is None:
        user.setup_completed_at = datetime.now(timezone.utc)
        if membership.is_practice_owner:
            membership.organization.status = "active"


# ── Creating accounts ─────────────────────────────────────────────────────────

async def email_in_use(db: AsyncSession, email: str) -> bool:
    return (await db.execute(select(User.id).where(User.email == email))).first() is not None


async def create_member(
    db: AsyncSession,
    organization_id: uuid.UUID,
    email: str,
    name: str,
    role: str,
    is_admin: bool = False,
    credentials: str | None = None,
) -> User:
    """A clinician or office manager in a practice, who has not set up yet. Their password is
    random and never sent: they choose their own from a setup link."""
    user = User(email=email, password_hash=hash_password(secrets.token_urlsafe(32)))
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, organization_id=organization_id, role=role,
                    is_org_admin=is_admin))
    if role == CLINICIAN:
        db.add(PractitionerProfile(user_id=user.id, organization_id=organization_id, name=name,
                                   credentials=credentials))
    else:
        db.add(PracticeManagerProfile(user_id=user.id, organization_id=organization_id, name=name))
    await db.flush()
    return user


async def create_practice(
    db: AsyncSession,
    name: str,
    state: str | None = None,
    size: int | None = None,
    org_status: str = "setting_up",
) -> Organization:
    org = Organization(name=name, type="clinic", settings={}, status=org_status, state=state,
                       size=size)
    db.add(org)
    await db.flush()
    # Every practice starts with the default consultation checklist.
    await checklist_item_service.seed_defaults(db, org.id)
    return org


async def send_setup_link(
    db: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
    purpose: str,
    intro: str,
    created_by_user_id: uuid.UUID | None,
) -> None:
    """Issue a setup link, commit, then email it. Committed first so the link works on arrival."""
    token = await setup_link_service.issue(
        db, user.id, organization_id, purpose=purpose, created_by_user_id=created_by_user_id,
    )
    email = user.email
    await db.commit()
    await send_setup_email(
        to_email=email,
        setup_url=setup_link_service.setup_url(token),
        days_valid=setup_link_service.LINK_LIFETIME.days,
        intro=intro,
    )


# ── Access requests ───────────────────────────────────────────────────────────

async def approve_request(db: AsyncSession, request, reviewed_by_user_id: uuid.UUID | None) -> Organization:
    """Create the practice and the person who asked, and send them a setup link.

    The practice stays in setup until that person finishes the setup screens, which is where the
    BAA is accepted. Raises 409 if the request was already dealt with or the email has an account.
    """
    if request.status != "new":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This request has already been dealt with.")
    if await email_in_use(db, request.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Someone with this email already has a Float account.")

    org = await create_practice(db, request.practice_name, state=request.state,
                                size=request.practice_size)
    user = await create_member(
        db, org.id, request.email, request.name, request.role, is_admin=True,
        credentials=request.credentials if request.role == CLINICIAN else None,
    )
    request.status = "approved"
    request.reviewed_at = datetime.now(timezone.utc)
    request.reviewed_by_user_id = reviewed_by_user_id
    request.organization_id = org.id
    practice_name = org.name
    await send_setup_link(
        db, user, org.id, purpose="practice_owner",
        intro=f"Your request to use Float for {practice_name} has been approved.",
        created_by_user_id=reviewed_by_user_id,
    )
    return org
