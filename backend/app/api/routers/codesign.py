"""Teen co-design sign-ups from floatcbt.com/codesign. docs/plans/codesign-signup.md

A teen picks one date from each week; their parent gets a link to give permission. The public
routes take no login: listing the dates, signing up, and the permission link (an unguessable
token). The list of who signed up is for Float's admins, and for the clinician logins named in
the CODESIGN_VIEWERS setting (docs/plans/codesign-viewer.md).

Not patients: nothing here reads or writes a patient, family or clinician record.
"""
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, StrictBool, StringConstraints
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import get_admin_context
from app.api.routers.patients import get_practitioner_context
from app.core.config import settings
from app.core.database import get_db
from app.models.codesign import CodesignSession, CodesignSignup
from app.models.user import User
from app.services import codesign_form, email_service
from app.services.codesign_viewers import can_view_codesign

router = APIRouter(tags=["codesign"])
logger = logging.getLogger(__name__)

EASTERN = ZoneInfo("America/New_York")
# "Sign up by Friday, November 6": open until the end of that day in Eastern time. Moved from
# October 30 when the sessions moved a week later (Peter, 2026-10-28).
SIGNUPS_CLOSE_AT = datetime(2026, 11, 7, 0, 0, tzinfo=EASTERN)
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
    """Sign-ups that count against a session's seats: confirmed, or still inside the hold with no
    answer yet. A declined form frees its seats at once."""
    return or_(
        CodesignSignup.permission_given_at.is_not(None),
        and_(CodesignSignup.created_at > now - HOLD, CodesignSignup.form_submitted_at.is_(None)),
    )


async def _taken(db: AsyncSession, now: datetime) -> dict[uuid.UUID, int]:
    taken: dict[uuid.UUID, int] = {}
    for column in (CodesignSignup.session1_id, CodesignSignup.session2_id):
        rows = (await db.execute(
            select(column, func.count()).where(_holding(now)).group_by(column)
        )).all()
        for session_id, n in rows:
            taken[session_id] = taken.get(session_id, 0) + n
    return taken


def _status(s: CodesignSignup, now: datetime) -> str:
    if s.permission_given_at is not None:
        return "confirmed"
    if _answered(s):
        return "declined"
    return "waiting" if s.created_at > now - HOLD else "released"


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
        cta_label="Read the permission form",
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
    name = _short_name(teen_first, teen_last)
    await _tell_the_team(db, f"New co-design sign-up: {name}",
                         f"{name} signed up for {dates[0]}, and {dates[1]}.")
    return {"success": True}


async def _by_token(db: AsyncSession, token: str, lock: bool = False) -> CodesignSignup:
    query = select(CodesignSignup).where(CodesignSignup.permission_token_hash == _hash(token))
    if lock:
        query = query.with_for_update()
    signup = (await db.execute(query)).scalar_one_or_none()
    if signup is None:
        raise HTTPException(status_code=404, detail="This link isn't valid.")
    return signup


async def _dates(db: AsyncSession, signup: CodesignSignup) -> list[str]:
    s1 = await db.get(CodesignSession, signup.session1_id)
    s2 = await db.get(CodesignSession, signup.session2_id)
    return [_when(s1), _when(s2)]


@router.get("/codesign/permission/{token}")
async def read_permission(token: str, db: AsyncSession = Depends(get_db)):
    """What the parent sees: the form, the teen's first name and the two dates. Nothing else about
    the teen or the parent, so the link alone gives away no surname, email or age."""
    signup = await _by_token(db, token)
    dates = await _dates(db, signup)
    return {
        "teen_first_name": signup.teen_first_name,
        "dates": dates,
        "answered": _answered(signup),
        "confirmed": signup.permission_given_at is not None,
        "form": codesign_form.form_for(dates),
    }


def _answered(signup: CodesignSignup) -> bool:
    # permission_given_at alone covers sign-ups confirmed before the form existed.
    return signup.form_submitted_at is not None or signup.permission_given_at is not None


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=7, max_length=40)]


class PermissionIn(BaseModel):
    """Every answer on the form, all required. StrictBool, so a missing answer, or "no" sent as
    text, is refused rather than read as a yes or a no."""
    parent_consents: StrictBool
    parent_allows_recording: StrictBool
    parent_confirms_guardian: StrictBool
    parent_name: Name
    parent_relationship: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    parent_phone: Phone
    # Blank on the page means the address the link was sent to, which the page cannot show.
    parent_email: EmailStr | None = None
    parent_session_phone: Phone
    # The box "My child wants to participate in this initiative." Unticked is an answer too.
    child_wants_to_take_part: StrictBool
    form_version: str = Field(max_length=100)


def _yes(b: bool | None) -> str:
    return "Yes" if b else "No"


def _stamp(at: datetime) -> str:
    """"October 21, 2026 at 6:36pm Eastern"."""
    local = at.astimezone(EASTERN)
    return (f"{local.strftime('%B')} {local.day}, {local.year} at "
            f"{local.strftime('%I').lstrip('0')}{local.strftime(':%M%p').lower()} Eastern")


def _copy_paragraphs(signup: CodesignSignup, dates: list[str], confirmed: bool) -> list[str]:
    """The parent's copy of the form ("We will give you a copy of this form to keep"): the text they
    were shown, every answer, theirs and the teen's, and when it was sent."""
    f = codesign_form
    teen = signup.teen_first_name
    when = _stamp(signup.form_submitted_at)
    outcome = (f"{teen} is confirmed for both sessions. Sally will send the video invites before the "
               "first session." if confirmed else
               f"The form says no to taking part, so {teen} will not take part and their places have "
               "been released.")
    return [
        f"This is your copy of the form, sent on {when}. {outcome}",
        *f.as_paragraphs(dates),
        f.PARENT_HEADING,
        f"Child's name: {signup.teen_first_name} {signup.teen_last_name}. Child's age: {signup.teen_age}.",
        *(f"{q} {_yes(getattr(signup, key))}" for key, q in f.PARENT_QUESTIONS.items()),
        f"{f.CHILD_WANTS} {_yes(signup.teen_consents)}",
        f"{f.PARENT_CONFIRM} {_yes(signup.parent_confirms_guardian)}",
        f"Parent or guardian name: {signup.parent_signed_name}",
        f"Signature: {signup.parent_signed_name} (typed). Date: {when}",
        f"Relationship to child: {signup.parent_relationship}",
        f"Phone and email: {signup.parent_phone}, {signup.parent_contact_email}",
        f"Best number to reach you during the session: {signup.parent_session_phone}",
        f"Form version: {signup.form_version}",
        "If you have questions, or want to change an answer, contact Sally McCarthy at "
        "sally@floatcbt.com.",
    ]


@router.post("/codesign/permission/{token}")
async def send_permission_form(token: str, data: PermissionIn, db: AsyncSession = Depends(get_db)):
    # Locked, so two sends at the same moment cannot both pass the check below.
    signup = await _by_token(db, token, lock=True)
    if _answered(signup):
        # Sent already; the first answer stands. To change it, the parent emails Sally.
        return {"success": True, "confirmed": signup.permission_given_at is not None, "already": True}
    if data.form_version != codesign_form.FORM_VERSION:
        # Only the wording the parent read may be recorded as the wording agreed to.
        raise HTTPException(status_code=409, detail="This form has changed since the page was opened. "
                                                    "Please reload the page.")
    if not data.parent_confirms_guardian:
        raise HTTPException(status_code=422, detail="Please tick the box to confirm you are the "
                                                    "child's parent or legal guardian.")
    now = _now()
    confirmed = data.parent_consents and data.child_wants_to_take_part
    signup.form_submitted_at = now
    signup.form_version = codesign_form.FORM_VERSION
    signup.parent_consents = data.parent_consents
    signup.parent_allows_recording = data.parent_allows_recording
    signup.parent_confirms_guardian = data.parent_confirms_guardian
    signup.parent_signed_name = data.parent_name
    signup.parent_relationship = data.parent_relationship
    signup.parent_phone = data.parent_phone
    signup.parent_contact_email = (data.parent_email or signup.parent_email).lower().strip()
    signup.parent_session_phone = data.parent_session_phone
    # The parent's "my child wants to participate" box (Peter, 2026-10-29). The teen agreement's
    # other answers are no longer asked, so they stay empty.
    signup.teen_consents = data.child_wants_to_take_part
    if confirmed:
        signup.permission_given_at = now
        signup.permission_given_by = data.parent_name
    await db.commit()

    dates = await _dates(db, signup)
    teen = signup.teen_first_name
    # The copy goes to the address the link was sent to, not one typed on the page: it holds the
    # teen's full name and age, and a typo must not send those to a stranger.
    await email_service.send_codesign_email(
        to_email=signup.parent_email,
        subject=f"Your copy: Float co-design permission form for {teen}",
        heading=codesign_form.TITLE,
        paragraphs=_copy_paragraphs(signup, dates, confirmed),
    )
    if confirmed:
        await email_service.send_codesign_email(
            to_email=signup.teen_email,
            subject="Permission received: Float teen design sessions",
            heading=f"You're all set, {teen}.",
            paragraphs=[
                f"Permission is recorded for you to join on {dates[0]}, and {dates[1]}.",
                "Sally will send the video invites before the first session.",
            ],
        )
    else:
        await email_service.send_codesign_email(
            to_email=signup.teen_email,
            subject="Float teen design sessions: you won't be taking part",
            heading=f"Thanks for letting us know, {teen}.",
            paragraphs=[
                "The permission form says no to taking part, so you won't be joining the sessions, "
                "and your places have been released.",
                "If this is a mistake, email Sally at sally@floatcbt.com.",
            ],
        )
    name = _short_name(signup.teen_first_name, signup.teen_last_name)
    if confirmed:
        await _tell_the_team(db, f"Co-design: {name} confirmed",
                             f"{name}'s parent gave permission. Their dates: {dates[0]}, and {dates[1]}.")
    else:
        await _tell_the_team(db, f"Co-design: {name} won't take part",
                             f"The permission form says no, so {name} won't take part. Their dates "
                             f"were {dates[0]}, and {dates[1]}. Those seats are free again.")
    return {"success": True, "confirmed": confirmed, "already": False}


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

    def out(s: CodesignSignup) -> dict:
        return {
            "id": str(s.id),
            "teen_first_name": s.teen_first_name,
            "teen_last_name": s.teen_last_name,
            "teen_age": s.teen_age,
            "teen_email": s.teen_email,
            "parent_name": s.parent_name,
            "parent_email": s.parent_email,
            "permission": _status(s, now),
            "permission_given_at": s.permission_given_at.isoformat() if s.permission_given_at else None,
            "permission_given_by": s.permission_given_by,
            "form_submitted_at": s.form_submitted_at.isoformat() if s.form_submitted_at else None,
            # Recording is the parent's answer (Peter, 2026-10-29: the teen agreement is dropped).
            "recording_allowed": bool(s.parent_allows_recording),
            "parent_relationship": s.parent_relationship,
            "parent_session_phone": s.parent_session_phone,
            "parent_phone": s.parent_phone,
            "parent_contact_email": s.parent_contact_email,
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


# ── Telling the team ─────────────────────────────────────────────────────────

_STATUS_WORDS = {
    "waiting": "waiting for permission",
    "confirmed": "confirmed",
    "declined": "declined",
    "released": "seats released",
}


def _short_name(first: str, last: str) -> str:
    """"Maya R.": the most of a teen's name the team summary may carry."""
    return f"{first} {last[:1].upper()}."


async def _tell_the_team(db: AsyncSession, subject: str, happened: str) -> None:
    """Email everyone on CODESIGN_NOTIFY_EMAILS what just happened and every sign-up so far.

    It goes to an inbox outside the sign-in, so it carries only each teen's first name and last
    initial, their dates and their status: no surname, age, email, phone or parent. The rest is on
    the list behind the sign-in. Sent after the sign-up or the answer is saved, and a failure is
    only logged, so it can never undo or fail either.
    """
    to = [e.strip() for e in settings.CODESIGN_NOTIFY_EMAILS.split(",") if e.strip()]
    if not to:
        return
    try:
        listing = await _signups_by_session(db)
        everyone = {s["id"] for sess in listing["sessions"] for s in sess["signups"]}
        paragraphs = [happened, f"All sign-ups so far: {len(everyone)}"]
        for sess in listing["sessions"]:
            teens = ", ".join(
                f"{_short_name(s['teen_first_name'], s['teen_last_name'])} "
                f"({_STATUS_WORDS[s['permission']]})"
                for s in sess["signups"]
            )
            paragraphs.append(f"{sess['label']}: {sess['taken']} of {sess['seats']} seats taken. "
                              + (f"{teens}." if teens else "No sign-ups yet."))
        for address in to:
            await email_service.send_codesign_email(
                to_email=address,
                subject=subject,
                heading=subject,
                paragraphs=paragraphs,
                cta_label="See the full list",
                cta_link=f"{settings.BASE_URL}/codesign/signups",
            )
    except Exception as e:
        logger.warning("co-design team summary failed: %s", type(e).__name__)
