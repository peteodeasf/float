"""Fill in 3 weeks, for the teen data testing page (docs/plans/teen-data-testing.md).

Makes a believable three-week exposure history for the signed-in child, so the clinician's Progress
tab can be tested before the new teen app exists. It runs through the same functions as recording
by hand, so the clinician's side reads it exactly as it would a real teen's work.

Deterministic on purpose: the same ladder gives the same history, so a tester can check the tab
against what was made, and the tests can say what was made.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.teen_testing import require_testing
from app.models.patient import PatientProfile
from app.models.user import User
from app.schemas.experiment import ExperimentAfterState, ExperimentBeforeState, ExperimentCreate
from app.services.experiment_service import (
    commit_experiment,
    create_experiment_for_behavior,
    mark_too_hard,
    notify_clinician_completed,
    save_after_state,
    save_before_state,
)

# Days ago each exposure was done: 3, then 3, then 2 a week over the past three weeks.
DONE_DAYS_AGO = [20, 18, 15, 13, 11, 8, 6, 4]
TOO_HARD_DAYS_AGO = 9
# Scheduled in the past and never done, so the clinician sees it as missed. Nothing stores
# "missed": the clinician's app shows a set-up exposure whose day has passed as missed.
MISSED_DAYS_AGO = 2
# How many times each rung is done before moving up the ladder.
TIMES_PER_RUNG = 3

# The same hours the teen app stamps on morning, afternoon and evening (lib/setupQuestions.ts).
BUCKETS = [("afternoon", 14), ("evening", 19), ("morning", 9)]
READINESS = ["low", "medium", "high"]

PREDICTION = "Test entry: I will panic and have to leave."


def _clamp(v: float, lo: int, hi: int) -> int:
    return int(max(lo, min(hi, round(v))))


def _at(now: datetime, days_ago: int, hour: int) -> datetime:
    return (now - timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0, microsecond=0)


async def _set_up(db, patient, rung: dict, when: datetime, bucket: str, *, expected: int,
                  belief: int, readiness: str):
    """Picks a day, answers the before questions and locks it in — what the teen app does."""
    exp = await create_experiment_for_behavior(
        db, uuid.UUID(rung["id"]), patient.id, patient.organization_id, ExperimentCreate(scheduled_date=when)
    )
    await save_before_state(db, exp.id, patient.organization_id, ExperimentBeforeState(
        plan_description=rung["name"],
        prediction=PREDICTION,
        bip_before=belief,
        distress_thermometer_expected=expected,
        confidence_level=readiness,
        scheduled_time_bucket=bucket,
    ), patient_id=patient.id)
    return await commit_experiment(db, exp.id, patient.id)


def _set_up_the_day_before(exp, when: datetime) -> None:
    # Set up the day before it was due, as a teen would. Without this every row says it was made
    # today, and the clinician's "last active" and this week's counts would all point at now.
    exp.created_at = when - timedelta(days=1)
    exp.committed_at = when - timedelta(days=1)


async def fill_three_weeks(
    db: AsyncSession, user: User, patient: PatientProfile, rungs: list[dict]
) -> dict:
    """Make the history on `rungs` — the child's own ladder, easiest first, as the teen app gets
    it. The caller passes only rungs from the signed-in child's ladder."""
    require_testing()
    now = datetime.now(timezone.utc)
    last = len(rungs) - 1
    made: list = []

    def fears(rung: dict, rep: int, progress: float) -> tuple[int, int]:
        own = rung["dt"] if rung["dt"] is not None else 5
        # Expected near the rung's own score, coming down with each go and over the weeks; the
        # actual a little under what they expected.
        expected = _clamp(own - 0.5 * rep - progress, 2, 10)
        actual = _clamp(expected - 1 - 0.5 * rep, 1, expected - 1)
        return expected, actual

    def beliefs(progress: float) -> tuple[int, int]:
        before = _clamp(80 - 30 * progress, 0, 100)
        return before, _clamp(before - 25 - 10 * progress, 0, before)

    done = 0
    events = sorted(
        [(d, "done") for d in DONE_DAYS_AGO]
        + [(TOO_HARD_DAYS_AGO, "too_hard"), (MISSED_DAYS_AGO, "missed")],
        key=lambda e: -e[0],
    )
    for n, (days_ago, kind) in enumerate(events):
        bucket, hour = BUCKETS[n % len(BUCKETS)]
        when = _at(now, days_ago, hour)
        progress = done / max(1, len(DONE_DAYS_AGO) - 1)

        if kind == "done":
            rung = rungs[min(done // TIMES_PER_RUNG, last)]
            rep = done % TIMES_PER_RUNG
            expected, actual = fears(rung, rep, progress)
            before, after = beliefs(progress)
            exp = await _set_up(db, patient, rung, when, bucket, expected=expected,
                                belief=before, readiness=READINESS[min(rep, 2)])
            # One time the feared thing does happen, so the "came true" count is not always zero.
            happened = done == 2
            exp = await save_after_state(db, exp.id, patient.organization_id, ExperimentAfterState(
                feared_outcome_occurred=happened,
                what_happened=(
                    "Test entry: it did happen a bit, and I got through it." if happened
                    else "Test entry: it was hard at first, then it got easier."
                ),
                distress_thermometer_actual=actual,
                bip_after=after,
                what_learned=(
                    "Test entry: I can cope even when it happens." if happened
                    else "Test entry: the fear went down when I stayed."
                ),
                completed_at=when + timedelta(minutes=30),
            ), patient_id=patient.id)
            await notify_clinician_completed(db, user, patient, exp)
            done += 1
        else:
            # The rung above where they have got to: a step too far, or one they never got to.
            rung = rungs[min(done // TIMES_PER_RUNG + 1, last)]
            expected, _ = fears(rung, 0, progress)
            before, _ = beliefs(progress)
            exp = await _set_up(db, patient, rung, when, bucket, expected=expected,
                                belief=before, readiness="low")
            if kind == "too_hard":
                exp = await mark_too_hard(
                    db, exp.id, user, patient, "Test entry: it felt like too big a jump",
                    at=when + timedelta(minutes=10),
                )

        _set_up_the_day_before(exp, when)
        made.append((kind, exp))

    await db.commit()
    return {
        "done": sum(1 for k, _ in made if k == "done"),
        "too_hard": sum(1 for k, _ in made if k == "too_hard"),
        "missed": sum(1 for k, _ in made if k == "missed"),
        "experiment_ids": [str(e.id) for _, e in made],
    }
