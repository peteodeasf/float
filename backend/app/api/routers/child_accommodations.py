"""The child rates the accommodations on their plan: if their parent stopped, how hard would it be?

Peter, 2026-09-10: only what the clinician added to the plan and sent to them, and they never see
the parent's estimate. Their answer is what orders the parent's plan.
docs/plans/accommodation-conversation.md
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.patients import get_patient_context
from app.core.database import get_db
from app.models.experiment import AccommodationBehavior
from app.models.treatment import TreatmentPlan, TriggerSituation
from app.schemas.accommodation import ChildRatingIn

router = APIRouter(prefix="/patient", tags=["patient"])


async def _plan(db: AsyncSession, patient) -> TreatmentPlan | None:
    return (await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.patient_id == patient.id,
            TreatmentPlan.status.in_(["setup", "active"]),
        )
    )).scalar_one_or_none()


def _out(a: AccommodationBehavior, situation_name: str | None) -> dict:
    """Built field by field: never the parent's estimate. The rating is theirs, and shown only once
    they have given it — before that the number on the row is the clinician's guess."""
    rated = a.child_rated_at is not None
    return {
        "id": str(a.id),
        "name": a.name,
        "situation_name": situation_name,
        "rated": rated,
        "rating_min": float(a.distress_min) if rated and a.distress_min is not None else None,
        "rating_max": float(a.distress_max) if rated and a.distress_max is not None else None,
    }


@router.get("/accommodations-to-rate")
async def accommodations_to_rate(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db),
):
    _, patient = context
    plan = await _plan(db, patient)
    if not plan:
        return []
    rows = (await db.execute(
        select(AccommodationBehavior, TriggerSituation.name)
        .outerjoin(TriggerSituation, TriggerSituation.id == AccommodationBehavior.trigger_situation_id)
        .where(
            AccommodationBehavior.treatment_plan_id == plan.id,
            AccommodationBehavior.child_rating_requested_at.is_not(None),
        )
        .order_by(AccommodationBehavior.display_order)
    )).all()
    return [_out(a, name) for a, name in rows]


@router.put("/accommodations/{accommodation_id}/rating")
async def rate_accommodation(
    accommodation_id: uuid.UUID,
    data: ChildRatingIn,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db),
):
    _, patient = context
    plan = await _plan(db, patient)
    acc = None
    if plan:
        acc = (await db.execute(
            select(AccommodationBehavior).where(
                AccommodationBehavior.id == accommodation_id,
                AccommodationBehavior.treatment_plan_id == plan.id,
                AccommodationBehavior.child_rating_requested_at.is_not(None),
            )
        )).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Not found")
    acc.distress_min, acc.distress_max = data.rating_min, data.rating_max
    acc.child_rated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(acc)
    return _out(acc, None)
