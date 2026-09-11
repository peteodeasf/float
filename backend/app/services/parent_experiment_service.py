"""The parent's accommodation experiments: set up by the parent at home or by the clinician in a
parent session, recorded by any parent linked to the child. Both apps' routes call these.
docs/plans/parent-accommodation-experiments.md
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.experiment import AccommodationBehavior, ParentExperiment
from app.schemas.parent_experiment import ParentExperimentAfter, ParentExperimentCreate


def _f(v) -> float | None:
    return float(v) if v is not None else None


def experiment_out(e: ParentExperiment, accommodation_name: str | None) -> dict:
    return {
        "id": str(e.id),
        "accommodation_id": str(e.accommodation_id),
        "accommodation_name": accommodation_name,
        "status": e.status,
        "set_up_in_session": e.parent_user_id is None,
        "scheduled_date": e.scheduled_date.isoformat() if e.scheduled_date else None,
        "scheduled_time_bucket": e.scheduled_time_bucket,
        "instead": e.instead,
        "prediction": e.prediction,
        "belief_before": _f(e.belief_before),
        "expected_fear": _f(e.expected_fear),
        "readiness": e.readiness,
        "did_it": e.did_it,
        "what_happened": e.what_happened,
        "actual_fear": _f(e.actual_fear),
        "prediction_happened": e.prediction_happened,
        "belief_after": _f(e.belief_after),
        "what_learned": e.what_learned,
        "too_hard_reason": e.too_hard_reason,
        "recorded_at": e.recorded_at.isoformat() if e.recorded_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


async def list_for_plan(db: AsyncSession, plan_id: uuid.UUID) -> list[dict]:
    """Coming up first (soonest first), then what has been recorded (latest first)."""
    rows = (await db.execute(
        select(ParentExperiment, AccommodationBehavior.name)
        .join(AccommodationBehavior, AccommodationBehavior.id == ParentExperiment.accommodation_id)
        .where(ParentExperiment.treatment_plan_id == plan_id)
    )).all()
    planned = sorted((r for r in rows if r[0].status == "planned"), key=lambda r: r[0].scheduled_date)
    recorded = sorted((r for r in rows if r[0].status != "planned"),
                      key=lambda r: r[0].recorded_at or r[0].created_at, reverse=True)
    return [experiment_out(e, name) for e, name in [*planned, *recorded]]


async def set_up(
    db: AsyncSession, plan_id: uuid.UUID, organization_id: uuid.UUID,
    data: ParentExperimentCreate, parent_user_id: uuid.UUID | None,
) -> dict:
    """Any accommodation on this plan, not only the weekly focus (Peter, 2026-09-11: "they choose to
    work on more than one and we shouldn't limit that")."""
    acc = (await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.id == data.accommodation_id,
            AccommodationBehavior.treatment_plan_id == plan_id,
        )
    )).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Accommodation not found")
    e = ParentExperiment(
        treatment_plan_id=plan_id,
        accommodation_id=acc.id,
        organization_id=organization_id,
        parent_user_id=parent_user_id,
        scheduled_date=data.scheduled_date,
        scheduled_time_bucket=data.scheduled_time_bucket,
        instead=(data.instead or "").strip() or None,
        prediction=data.prediction.strip(),
        belief_before=data.belief_before,
        expected_fear=data.expected_fear,
        readiness=data.readiness,
    )
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return experiment_out(e, acc.name)


async def record(db: AsyncSession, plan_id: uuid.UUID, experiment_id: uuid.UUID, data: ParentExperimentAfter) -> dict:
    """How it went. Once: a recorded experiment is the record."""
    row = (await db.execute(
        select(ParentExperiment, AccommodationBehavior.name)
        .join(AccommodationBehavior, AccommodationBehavior.id == ParentExperiment.accommodation_id)
        .where(ParentExperiment.id == experiment_id, ParentExperiment.treatment_plan_id == plan_id)
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    e, name = row
    if e.status != "planned":
        raise HTTPException(status_code=409, detail="This one has already been recorded")
    e.did_it = data.did_it
    if data.did_it == "not_this_time":
        # The rest is about an attempt that did not happen.
        e.too_hard_reason = (data.too_hard_reason or "").strip() or None
    else:
        e.what_happened = (data.what_happened or "").strip() or None
        e.actual_fear = data.actual_fear
        e.prediction_happened = data.prediction_happened
        e.belief_after = data.belief_after
        e.what_learned = (data.what_learned or "").strip() or None
    e.status = "recorded"
    e.recorded_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(e)
    return experiment_out(e, name)
