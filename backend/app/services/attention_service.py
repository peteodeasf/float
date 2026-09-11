"""What needs a clinician's attention on a patient, worked out from the records in one place.

The patient list and the patient page both show these, so the two cannot disagree. Two kinds: a
problem to follow up, and something new to look at. Peter, 2026-09-11, chose the reasons: the three
the list already had, a missed weekly check-in, an exposure marked too hard, and the new things. Not
"Gave in" on the check-in (he is still unsure about it) and not unanswered messages.
docs/plans/clinician-notifications.md
"""
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.experiment import AccommodationBehavior, AccommodationCheckin, Experiment
from app.models.insight import KIND_ACCOMMODATION, SOURCE_PARENT, PatientInsight
from app.models.monitoring import MonitoringEntry, MonitoringForm
from app.models.patient import ParentPatientLink, PatientProfile
from app.models.treatment import AvoidanceBehavior, TreatmentPlan

PROBLEM = "problem"
NEW = "new"
RECENT = timedelta(days=7)


def _reason(kind: str, tone: str, text: str, items: list | None = None) -> dict:
    return {"kind": kind, "tone": tone, "text": text, "items": items or []}


def _n(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _item(exp: Experiment, name: str | None, when: datetime | None) -> dict:
    return {"id": str(exp.id), "name": name or exp.plan_description or "Exposure",
            "date": when.isoformat() if when else None}


async def attention_for(db: AsyncSession, patient: PatientProfile, now: datetime | None = None) -> list[dict]:
    """Problems first, then what is new. A closed patient needs nothing."""
    if patient.closed_at is not None:
        return []
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - RECENT
    problems: list[dict] = []
    new: list[dict] = []

    plan = (await db.execute(
        select(TreatmentPlan).where(TreatmentPlan.patient_id == patient.id)
        .order_by(TreatmentPlan.created_at.desc())
    )).scalars().first()

    # An exposure whose day has passed with nothing recorded: one the child agreed to, or one set
    # for a day they never finished setting up.
    overdue = (await db.execute(
        select(Experiment, AvoidanceBehavior.name)
        .outerjoin(AvoidanceBehavior, AvoidanceBehavior.id == Experiment.avoidance_behavior_id)
        .where(
            Experiment.patient_id == patient.id,
            Experiment.status.in_(["committed", "planned"]),
            Experiment.scheduled_date.is_not(None),
            Experiment.scheduled_date < today_start,
        ).order_by(Experiment.scheduled_date)
    )).all()
    if overdue:
        problems.append(_reason(
            "overdue", PROBLEM,
            f"{_n(len(overdue), 'exposure', 'exposures')} passed with nothing recorded",
            [_item(e, name, e.scheduled_date) for e, name in overdue],
        ))

    # An active plan with nothing done on it in the past week.
    if plan is not None and plan.status == "active":
        recent = (await db.execute(
            select(Experiment.id).where(
                Experiment.patient_id == patient.id,
                or_(
                    Experiment.created_at >= week_ago,
                    Experiment.committed_at >= week_ago,
                    Experiment.completed_date >= week_ago,
                ),
            ).limit(1)
        )).first()
        if recent is None:
            problems.append(_reason("no_activity", PROBLEM, "Nothing done on the plan this week"))

    # A monitoring form sent and fewer than three entries back. The rule the list already had.
    forms = (await db.execute(
        select(MonitoringForm.id, MonitoringForm.sent_at).where(MonitoringForm.patient_id == patient.id)
    )).all()
    if any(f.sent_at is not None for f in forms):
        entries = (await db.execute(
            select(func.count()).select_from(MonitoringEntry).where(
                MonitoringEntry.monitoring_form_id.in_([f.id for f in forms]),
                MonitoringEntry.is_draft.is_(False),
            )
        )).scalar_one()
        if entries < 3:
            problems.append(_reason("monitoring", PROBLEM, f"Monitoring form sent; {entries} of 3 entries back"))

    # The parent did not answer the weekly check-in last week. Only when a parent is linked and the
    # focus accommodation was on the plan for all of last week: nothing records when an accommodation
    # became the focus, so when it was added is the nearest honest stand-in.
    if plan is not None:
        this_monday = today_start.date() - timedelta(days=today_start.weekday())
        last_monday = this_monday - timedelta(days=7)
        last_monday_start = datetime.combine(last_monday, time.min, tzinfo=timezone.utc)
        focus = (await db.execute(
            select(AccommodationBehavior).where(
                AccommodationBehavior.treatment_plan_id == plan.id,
                AccommodationBehavior.is_weekly_focus.is_(True),
            )
        )).scalars().first()
        has_parent = (await db.execute(
            select(ParentPatientLink.id).where(ParentPatientLink.patient_id == patient.id).limit(1)
        )).first() is not None
        if focus is not None and has_parent and focus.created_at and focus.created_at < last_monday_start:
            answered = (await db.execute(
                select(AccommodationCheckin.id).where(
                    AccommodationCheckin.treatment_plan_id == plan.id,
                    AccommodationCheckin.week_start == last_monday,
                ).limit(1)
            )).first()
            if answered is None:
                problems.append(_reason("checkin_missed", PROBLEM, "No weekly check-in from the parent last week"))

    # The child marked an exposure too hard in the past week.
    too_hard = (await db.execute(
        select(Experiment, AvoidanceBehavior.name)
        .outerjoin(AvoidanceBehavior, AvoidanceBehavior.id == Experiment.avoidance_behavior_id)
        .where(
            Experiment.patient_id == patient.id,
            Experiment.status == "too_hard",
            Experiment.too_hard_at >= week_ago,
        ).order_by(Experiment.too_hard_at.desc())
    )).all()
    if too_hard:
        problems.append(_reason(
            "too_hard", PROBLEM,
            f"Marked {_n(len(too_hard), 'exposure', 'exposures')} too hard this week",
            [_item(e, name, e.too_hard_at) for e, name in too_hard],
        ))

    # New: the child rated every accommodation sent to them, the last one in the past week.
    if plan is not None:
        sent = (await db.execute(
            select(AccommodationBehavior).where(
                AccommodationBehavior.treatment_plan_id == plan.id,
                AccommodationBehavior.child_rating_requested_at.is_not(None),
            )
        )).scalars().all()
        rated = [a.child_rated_at for a in sent]
        if sent and all(rated) and max(rated) >= week_ago:
            new.append(_reason("ratings_done", NEW, "Rated the accommodations: ready to sort by Fear Level"))

    # New: accommodations the parent named in the past week, not yet added or taken off the list.
    named = [
        r for r in (await db.execute(
            select(PatientInsight).where(
                PatientInsight.patient_id == patient.id,
                PatientInsight.kind == KIND_ACCOMMODATION,
                PatientInsight.removed_at.is_(None),
                PatientInsight.accommodation_behavior_id.is_(None),
                PatientInsight.first_seen_at >= week_ago,
            )
        )).scalars().all()
        if SOURCE_PARENT in (r.sources or []) and not (r.monitoring_entry_ids or r.session_note_ids)
    ]
    if named:
        new.append(_reason(
            "parent_named", NEW,
            f"The parent named {_n(len(named), 'accommodation', 'accommodations')}: see the suggestions",
        ))

    return problems + new
