"""What the scheduled-jobs service does each time it runs. docs/plans/scheduled-jobs.md

Every 15 minutes: remind children of today's exposures at the time they picked, give their parent
a heads-up that morning (only when the clinician shares the child's progress with them), remind
parents on Sunday evening to answer the weekly check-in, and run the missed-exposure check. Nothing before 8am
or after 8pm where the person lives, at most one reminder a day each, and never the same reminder
twice. The emails say nothing clinical — only that something is waiting in Float.
"""
import hashlib
import hmac
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.experiment import AccommodationBehavior, AccommodationCheckin, Experiment
from app.models.patient import ParentPatientLink, PatientProfile
from app.models.reminder import ReminderSent
from app.models.treatment import TreatmentPlan
from app.models.user import User
from app.services import email_service
from app.services.missed_experiment_service import detect_missed_experiments

logger = logging.getLogger(__name__)

WAKING_START, WAKING_END = 8, 20  # 8am up to 8pm, where they live
CHECKIN_FROM_HOUR = 18            # Sunday from 6pm

KIND_CHILD_EXPOSURE = "child_exposure"
KIND_PARENT_EXPOSURE = "parent_exposure"
KIND_PARENT_CHECKIN = "parent_checkin"

# Fixed words. Nothing about the child, the step or the accommodation goes into an email.
CONTENT = {
    KIND_CHILD_EXPOSURE: dict(
        subject="Something planned in Float today",
        heading="You have something planned today",
        body="Open Float to see it.",
        cta="Open Float",
        path="/teen/home",
    ),
    KIND_PARENT_EXPOSURE: dict(
        subject="Something planned in Float today",
        heading="There's something planned today",
        body="Open Float to see what it is and how you can help.",
        cta="Open Float",
        path="/parent/home",
    ),
    KIND_PARENT_CHECKIN: dict(
        subject="Your weekly check-in is ready",
        heading="How did this week go?",
        body="There's one question waiting for you in Float about this week.",
        cta="Open Float",
        path="/parent/home",
    ),
}

Send = Callable[[User, str], Awaitable[bool]]


# ── The link that turns reminder emails off ──────────────────────────────────

def _signature(user_hex: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"reminders-off:{user_hex}".encode(),
                    hashlib.sha256).hexdigest()


def off_token(user_id: uuid.UUID) -> str:
    """The token in a reminder email's off link. It can only turn that person's reminders off."""
    return f"{user_id.hex}.{_signature(user_id.hex)}"


def user_from_off_token(token: str) -> uuid.UUID | None:
    try:
        user_hex, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _signature(user_hex)):
            return None
        return uuid.UUID(hex=user_hex)
    except (ValueError, AttributeError, TypeError):
        # TypeError: compare_digest refuses characters outside plain ASCII. Found by the security
        # review — such a link gave a server error instead of "This link isn't valid".
        return None


# ── Time where they live ─────────────────────────────────────────────────────

def _local(now_utc: datetime, tz_name: str | None) -> datetime | None:
    try:
        return now_utc.astimezone(ZoneInfo(tz_name)) if tz_name else None
    except Exception:
        return None


def _waking(local: datetime) -> bool:
    return WAKING_START <= local.hour < WAKING_END


# ── Sending, at most once ────────────────────────────────────────────────────

async def default_send(user: User, kind: str) -> bool:
    c = CONTENT[kind]
    return await email_service.send_reminder_email(
        to_email=user.email,
        subject=c["subject"],
        heading=c["heading"],
        body=c["body"],
        cta_label=c["cta"],
        cta_link=f"{settings.BASE_URL}{c['path']}",
        off_link=f"{settings.BASE_URL}/reminders/off?token={off_token(user.id)}",
    )


async def _remind(db: AsyncSession, user: User, kind: str, ref: str, local_day: date, send: Send) -> bool:
    """Send unless they already had a reminder today, or this one already went."""
    already = (await db.execute(
        select(ReminderSent.id).where(
            ReminderSent.user_id == user.id,
            (ReminderSent.local_date == local_day)
            | ((ReminderSent.kind == kind) & (ReminderSent.ref == ref)),
        ).limit(1)
    )).first()
    if already is not None:
        return False
    if not await send(user, kind):
        return False  # tried again next run
    db.add(ReminderSent(user_id=user.id, kind=kind, ref=ref, local_date=local_day))
    await db.flush()
    return True


# ── The reminders ────────────────────────────────────────────────────────────

async def child_exposure_reminders(db: AsyncSession, now_utc: datetime, send: Send) -> int:
    """A child with an exposure today, where they live, whose time has come."""
    rows = (await db.execute(
        select(Experiment, User)
        .join(PatientProfile, PatientProfile.id == Experiment.patient_id)
        .join(User, User.id == PatientProfile.user_id)
        .join(TreatmentPlan, TreatmentPlan.patient_id == PatientProfile.id)
        .where(
            Experiment.status == "committed",
            Experiment.scheduled_date.is_not(None),
            Experiment.scheduled_date <= now_utc,
            Experiment.scheduled_date > now_utc - timedelta(days=1),
            PatientProfile.closed_at.is_(None),
            PatientProfile.teen_invited_at.is_not(None),
            TreatmentPlan.status.in_(["setup", "active"]),
            TreatmentPlan.ladder_active.is_(True),
            User.timezone.is_not(None),
            User.reminder_emails_off_at.is_(None),
        )
    )).all()
    by_user: dict[uuid.UUID, tuple[User, list[Experiment]]] = {}
    for exp, user in rows:
        by_user.setdefault(user.id, (user, []))[1].append(exp)

    sent = 0
    for user, exps in by_user.values():
        local = _local(now_utc, user.timezone)
        if local is None or not _waking(local):
            continue
        today = [e for e in exps if e.scheduled_date.astimezone(local.tzinfo).date() == local.date()]
        if not today:
            continue
        if await _remind(db, user, KIND_CHILD_EXPOSURE, local.date().isoformat(), local.date(), send):
            for e in today:
                e.reminder_sent_at = now_utc
            sent += 1
    return sent


async def _checkin_pending(db: AsyncSession, parent_id: uuid.UUID, plan_ids: set, week_start: date) -> bool:
    """A weekly focus on one of these plans that this parent has not answered for this week."""
    focus_ids = (await db.execute(
        select(AccommodationBehavior.id).where(
            AccommodationBehavior.treatment_plan_id.in_(plan_ids),
            AccommodationBehavior.is_weekly_focus.is_(True),
        )
    )).scalars().all()
    for focus_id in focus_ids:
        answered = (await db.execute(
            select(AccommodationCheckin.id).where(
                AccommodationCheckin.parent_user_id == parent_id,
                AccommodationCheckin.accommodation_id == focus_id,
                AccommodationCheckin.week_start == week_start,
            ).limit(1)
        )).first()
        if answered is None:
            return True
    return False


async def parent_exposure_reminders(db: AsyncSession, now_utc: datetime, send: Send) -> int:
    """The morning of a child's exposure day, a heads-up to their parent, so they have the day to get
    ready. Only when the clinician has switched on "Parents can see the child's progress" — without
    it the parent is not told about the child's exposures at all (Peter, 2026-09-10).

    On a Sunday the weekly check-in, if still to answer, gets the day's one reminder instead.
    """
    rows = (await db.execute(
        select(Experiment, User, TreatmentPlan.id)
        .join(PatientProfile, PatientProfile.id == Experiment.patient_id)
        .join(ParentPatientLink, ParentPatientLink.patient_id == PatientProfile.id)
        .join(User, User.id == ParentPatientLink.parent_user_id)
        .join(TreatmentPlan, TreatmentPlan.patient_id == PatientProfile.id)
        .where(
            Experiment.status == "committed",
            Experiment.scheduled_date.is_not(None),
            Experiment.scheduled_date > now_utc - timedelta(days=1),
            Experiment.scheduled_date < now_utc + timedelta(days=1),
            PatientProfile.closed_at.is_(None),
            PatientProfile.progress_shared_with_parent_at.is_not(None),
            TreatmentPlan.status.in_(["setup", "active"]),
            TreatmentPlan.ladder_active.is_(True),
            User.timezone.is_not(None),
            User.reminder_emails_off_at.is_(None),
        )
    )).all()
    by_parent: dict[uuid.UUID, tuple[User, list[Experiment], set]] = {}
    for exp, user, plan_id in rows:
        entry = by_parent.setdefault(user.id, (user, [], set()))
        entry[1].append(exp)
        entry[2].add(plan_id)

    sent = 0
    for user, exps, plan_ids in by_parent.values():
        local = _local(now_utc, user.timezone)
        if local is None or not _waking(local):
            continue
        if not any(e.scheduled_date.astimezone(local.tzinfo).date() == local.date() for e in exps):
            continue
        week_start = local.date() - timedelta(days=local.weekday())
        if local.weekday() == 6 and await _checkin_pending(db, user.id, plan_ids, week_start):
            continue
        if await _remind(db, user, KIND_PARENT_EXPOSURE, local.date().isoformat(), local.date(), send):
            sent += 1
    return sent


async def parent_checkin_reminders(db: AsyncSession, now_utc: datetime, send: Send) -> int:
    """Sunday evening, where they live: a parent whose child has a weekly focus and who has not
    answered for this week."""
    rows = (await db.execute(
        select(User, AccommodationBehavior)
        .join(ParentPatientLink, ParentPatientLink.parent_user_id == User.id)
        .join(PatientProfile, PatientProfile.id == ParentPatientLink.patient_id)
        .join(TreatmentPlan, TreatmentPlan.patient_id == PatientProfile.id)
        .join(AccommodationBehavior, AccommodationBehavior.treatment_plan_id == TreatmentPlan.id)
        .where(
            AccommodationBehavior.is_weekly_focus.is_(True),
            PatientProfile.closed_at.is_(None),
            TreatmentPlan.status.in_(["setup", "active"]),
            User.timezone.is_not(None),
            User.reminder_emails_off_at.is_(None),
        )
    )).all()
    sent = 0
    for user, focus in rows:
        local = _local(now_utc, user.timezone)
        if local is None or local.weekday() != 6 or local.hour < CHECKIN_FROM_HOUR or not _waking(local):
            continue
        week_start = local.date() - timedelta(days=local.weekday())  # Monday, as the parent app has it
        answered = (await db.execute(
            select(AccommodationCheckin.id).where(
                AccommodationCheckin.parent_user_id == user.id,
                AccommodationCheckin.accommodation_id == focus.id,
                AccommodationCheckin.week_start == week_start,
            ).limit(1)
        )).first()
        if answered is not None:
            continue
        if await _remind(db, user, KIND_PARENT_CHECKIN, week_start.isoformat(), local.date(), send):
            sent += 1
    return sent


async def run_due(db: AsyncSession, now_utc: datetime, send: Send | None = None) -> dict:
    send = send or default_send
    counts = {
        "child_exposure": await child_exposure_reminders(db, now_utc, send),
        "parent_exposure": await parent_exposure_reminders(db, now_utc, send),
        "parent_checkin": await parent_checkin_reminders(db, now_utc, send),
    }
    await db.commit()
    counts["missed"] = await detect_missed_experiments(db)
    return counts
