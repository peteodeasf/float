"""Teen co-design sign-ups from floatcbt.com/codesign. docs/plans/codesign-signup.md

A teen picks one date from each week; their parent gets a link to give permission. The public
routes take no login: listing the dates, signing up, and the permission link (an unguessable
token). The list of who signed up is for Float's admins, and for the clinician logins named in
the CODESIGN_VIEWERS setting (docs/plans/codesign-viewer.md).

Not patients: nothing here reads or writes a patient, family or clinician record.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import get_admin_context
from app.api.routers.patients import get_practitioner_context
from app.core.config import settings
from app.core.database import get_db
from app.models.codesign import CodesignSession, CodesignSignup
from app.models.user import User
from app.services import email_service
from app.services.codesign_viewers import can_view_codesign

router = APIRouter(tags=["codesign"])

EASTERN = ZoneInfo("America/New_York")
# "Sign up by Friday, October 30": open until the end of that day in Eastern time.
SIGNUPS_CLOSE_AT = datetime(2026, 10, 31, 0, 0, tzinfo=EASTERN)
# A sign-up holds its two seats this long while the parent has not given permission.
HOLD = timedelta(days=3)
# The same anti-bot bargain as the waitlist: a real person takes longer than this to fill the form.
MIN_FILL_MS = 3000
# At most this many sign-ups a day for one email address, so the page cannot be used to send a
# stream of emails to someone.
MAX_PER_EMAIL_PER_DAY = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _when(s: CodesignSession) -> str:
    """"Tuesday, November 3 at 12pm Eastern"."""
    local = s.starts_at.astimezone(EASTERN)
    hour = local.strftime("%I").lstrip("0")
    minutes = "" if local.minute == 0 else local.strftime(":%M")
    return f"{local.strftime('%A, %B')} {local.day} at {hour}{minutes}{local.strftime('%p').lower()} Eastern"


def _holding(now: datetime):
    """Sign-ups that count against a session's seats: permission given, or still inside the hold."""
    return or_(CodesignSignup.permission_given_at.is_not(None), CodesignSignup.created_at > now - HOLD)


async def _taken(db: AsyncSession, now: datetime) -> dict[uuid.UUID, int]:
    taken: dict[uuid.UUID, int] = {}
    for column in (CodesignSignup.session1_id, CodesignSignup.session2_id):
        rows = (await db.execute(
            select(column, func.count()).where(_holding(now)).group_by(column)
        )).all()
        for session_id, n in rows:
            taken[session_id] = taken.get(session_id, 0) + n
    return taken


def _session_out(s: CodesignSession, taken: int) -> dict:
    return {
        "id": str(s.id),
        "week": s.week,
        "starts_at": s.starts_at.isoformat(),
        "label": _when(s),
        "seats_left": max(s.seats - taken, 0),
        "full": taken >= s.seats,
    }


# ── Public ───────────────────────────────────────────────────────────────────

@router.get("/codesign/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    now = _now()
    sessions = (await db.execute(
        select(CodesignSession).order_by(CodesignSession.starts_at)
    )).scalars().all()
    taken = await _taken(db, now)
    return {
        "open": now < SIGNUPS_CLOSE_AT,
        "sessions": [_session_out(s, taken.get(s.id, 0)) for s in sessions],
    }


class SignupIn(BaseModel):
    teen_first_name: str = Field(min_length=1, max_length=100)
    teen_last_name: str = Field(min_length=1, max_length=100)
    teen_age: int = Field(ge=13, le=17)
    teen_email: EmailStr
    parent_name: str = Field(min_length=1, max_length=200)
    parent_email: EmailStr
    session1_id: uuid.UUID
    session2_id: uuid.UUID
    # Anti-bot. `company` is hidden from people, so a value means a bot filled it.
    company: str = ""
    elapsed_ms: int | None = None


@router.post("/codesign/signups")
async def sign_up(data: SignupIn, db: AsyncSession = Depends(get_db)):
    # Drop bots silently: success, so they get no signal, but nothing saved or sent.
    if data.company.strip() or (data.elapsed_ms is not None and data.elapsed_ms < MIN_FILL_MS):
        return {"success": True}

    now = _now()
    if now >= SIGNUPS_CLOSE_AT:
        raise HTTPException(status_code=400, detail="Sign-ups have closed.")

    teen_first = data.teen_first_name.strip()
    teen_last = data.teen_last_name.strip()
    parent_name = data.parent_name.strip()
    if not (teen_first and teen_last and parent_name):
        raise HTTPException(status_code=422, detail="Please fill in every name.")
    teen_email = data.teen_email.lower().strip()
    parent_email = data.parent_email.lower().strip()

    for email in {teen_email, parent_email}:
        recent = (await db.execute(
            select(func.count()).select_from(CodesignSignup).where(
                or_(CodesignSignup.teen_email == email, CodesignSignup.parent_email == email),
                CodesignSignup.created_at > now - timedelta(days=1),
            )
        )).scalar()
        if recent >= MAX_PER_EMAIL_PER_DAY:
            raise HTTPException(status_code=429, detail="Too many sign-ups for this email today.")

    # Lock the two sessions so two people cannot take the last seat at the same moment.
    sessions = {s.id: s for s in (await db.execute(
        select(CodesignSession)
        .where(CodesignSession.id.in_([data.session1_id, data.session2_id]))
        .with_for_update()
    )).scalars().all()}
    first, second = sessions.get(data.session1_id), sessions.get(data.session2_id)
    if first is None or second is None or first.week != 1 or second.week != 2:
        raise HTTPException(status_code=422, detail="Pick one date from each week.")
    taken = await _taken(db, now)
    full = [s for s in (first, second) if taken.get(s.id, 0) >= s.seats]
    if full:
        raise HTTPException(status_code=409, detail=f"{_when(full[0])} is full. Please pick another date.")

    token = secrets.token_urlsafe(32)
    signup = CodesignSignup(
        teen_first_name=teen_first, teen_last_name=teen_last, teen_age=data.teen_age,
        teen_email=teen_email, parent_name=parent_name, parent_email=parent_email,
        session1_id=first.id, session2_id=second.id, permission_token_hash=_hash(token),
    )
    db.add(signup)
    await db.commit()

    dates = [_when(first), _when(second)]
    link = f"{settings.WEBSITE_URL}/codesign/permission/?t={token}"
    await email_service.send_codesign_email(
        to_email=parent_email,
        subject=f"Your permission for {teen_first} to join Float's teen design sessions",
        heading=f"{teen_first} has signed up to help design Float",
        paragraphs=[
            f"Hi {parent_name}. {teen_first} has signed up for two virtual group sessions where "
            "teens tell us what they think about how apps should look, feel and work. Each one is "
            "45–60 minutes on video, and teens are paid $60 for joining both.",
            f"The dates they picked: {dates[0]}, and {dates[1]}.",
            "We need your permission before they take part. Their place is held for 3 days.",
        ],
        cta_label="Read and give permission",
        cta_link=link,
    )
    await email_service.send_codesign_email(
        to_email=teen_email,
        subject="You're signed up to help design Float",
        heading=f"Thanks, {teen_first}. You're signed up.",
        paragraphs=[
            f"Your dates: {dates[0]}, and {dates[1]}.",
            f"We've emailed {parent_name} to ask for their permission. Once they've given it, "
            "Sally will send you the video invites.",
        ],
    )
    return {"success": True}


async def _by_token(db: AsyncSession, token: str) -> CodesignSignup:
    signup = (await db.execute(
        select(CodesignSignup).where(CodesignSignup.permission_token_hash == _hash(token))
    )).scalar_one_or_none()
    if signup is None:
        raise HTTPException(status_code=404, detail="This link isn't valid.")
    return signup


async def _dates(db: AsyncSession, signup: CodesignSignup) -> list[str]:
    s1 = await db.get(CodesignSession, signup.session1_id)
    s2 = await db.get(CodesignSession, signup.session2_id)
    return [_when(s1), _when(s2)]


@router.get("/codesign/permission/{token}")
async def read_permission(token: str, db: AsyncSession = Depends(get_db)):
    """What the parent sees: the teen's first name and the two dates. Nothing else about them."""
    signup = await _by_token(db, token)
    return {
        "teen_first_name": signup.teen_first_name,
        "dates": await _dates(db, signup),
        "permission_given": signup.permission_given_at is not None,
    }


class PermissionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    agree: bool


@router.post("/codesign/permission/{token}")
async def give_permission(token: str, data: PermissionIn, db: AsyncSession = Depends(get_db)):
    signup = await _by_token(db, token)
    name = data.name.strip()
    if not data.agree or not name:
        raise HTTPException(status_code=422, detail="Type your name and tick the box to give permission.")
    if signup.permission_given_at is not None:
        return {"success": True}  # given already; the first one stands

    signup.permission_given_at = _now()
    signup.permission_given_by = name
    await db.commit()

    dates = await _dates(db, signup)
    for to_email, greeting in ((signup.parent_email, f"Thank you, {name}."),
                               (signup.teen_email, f"You're all set, {signup.teen_first_name}.")):
        await email_service.send_codesign_email(
            to_email=to_email,
            subject="Permission received: Float teen design sessions",
            heading=greeting,
            paragraphs=[
                f"Permission is recorded for {signup.teen_first_name} to join on {dates[0]}, "
                f"and {dates[1]}.",
                "Sally will send the video invites before the first session.",
            ],
        )
    return {"success": True}


# ── Who signed up: Float admins, and the named viewers ───────────────────────

async def _signups_by_session(db: AsyncSession) -> dict:
    """Every session with who signed up for it. The one source for both routes below, so the admin
    dashboard and the viewers' page cannot show different things."""
    now = _now()
    sessions = (await db.execute(
        select(CodesignSession).order_by(CodesignSession.starts_at)
    )).scalars().all()
    taken = await _taken(db, now)
    signups = (await db.execute(
        select(CodesignSignup).order_by(CodesignSignup.created_at)
    )).scalars().all()

    def status(s: CodesignSignup) -> str:
        if s.permission_given_at is not None:
            return "given"
        return "waiting" if s.created_at > now - HOLD else "released"

    def out(s: CodesignSignup) -> dict:
        return {
            "id": str(s.id),
            "teen_first_name": s.teen_first_name,
            "teen_last_name": s.teen_last_name,
            "teen_age": s.teen_age,
            "teen_email": s.teen_email,
            "parent_name": s.parent_name,
            "parent_email": s.parent_email,
            "permission": status(s),
            "permission_given_at": s.permission_given_at.isoformat() if s.permission_given_at else None,
            "permission_given_by": s.permission_given_by,
            "hold_ends_at": (s.created_at + HOLD).isoformat(),
            "created_at": s.created_at.isoformat(),
        }

    return {
        "sessions": [
            {
                **_session_out(sess, taken.get(sess.id, 0)),
                "seats": sess.seats,
                "taken": taken.get(sess.id, 0),
                "signups": [out(s) for s in signups if sess.id in (s.session1_id, s.session2_id)],
            }
            for sess in sessions
        ],
    }


@router.get("/codesign/signups")
async def list_signups(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    return await _signups_by_session(db)


async def get_codesign_viewer(context: tuple = Depends(get_practitioner_context)) -> User:
    """A signed-in clinician whose login email is on CODESIGN_VIEWERS. Everyone else gets 403.

    Through get_practitioner_context, so a parent's, a teen's or an office manager's login is
    refused before the list is even looked at: being on the list is not enough without a
    clinician account. docs/plans/codesign-viewer.md
    """
    user, _ = context
    if not can_view_codesign(user.email):
        raise HTTPException(status_code=403, detail="You don't have access to this list.")
    return user


@router.get("/codesign/viewer/signups")
async def list_signups_for_viewer(
    viewer: User = Depends(get_codesign_viewer),
    db: AsyncSession = Depends(get_db),
):
    """Read-only: the same list as the admin one, for the named people who run the sessions."""
    return await _signups_by_session(db)
