"""The accommodation conversation: what the parent says they do, as suggestions for the clinician.

The same questions in two places (Peter, 2026-09-10): the parent at home in their app, or in the
room with the clinician typing what they say. Both routes call these, so the two cannot drift.
Nothing here creates a plan row — the clinician adds suggestions from the Parent Accommodations
panel. docs/plans/accommodation-conversation.md
"""
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.experiment import AccommodationBehavior
from app.models.insight import KIND_ACCOMMODATION, KIND_SITUATION, SOURCE_PARENT, PatientInsight
from app.models.patient import PatientProfile
from app.models.treatment import TreatmentPlan, TriggerSituation
from app.services.insight_service import parent_named_accommodation, situation_insight_for


def estimate_range(lo: float | None, hi: float | None) -> tuple[float, float] | None:
    """A range, as the book's answers are (2–4, 5–9). One number is a range of one."""
    if lo is None and hi is None:
        return None
    lo = lo if lo is not None else hi
    hi = hi if hi is not None else lo
    if lo > hi:
        raise HTTPException(status_code=422, detail="The low end is above the high end")
    return lo, hi


def suggestion_out(r: PatientInsight) -> dict:
    """Only what the parent told us, or what came from their own log. Never the child's rating."""
    return {
        "id": str(r.id),
        "name": r.name,
        "from_record": bool(r.monitoring_entry_ids or r.session_note_ids),
        "still_does": r.still_does,
        "estimate_min": float(r.parent_estimate_min) if r.parent_estimate_min is not None else None,
        "estimate_max": float(r.parent_estimate_max) if r.parent_estimate_max is not None else None,
    }


async def plan_situations(db: AsyncSession, plan: TreatmentPlan) -> list[TriggerSituation]:
    return list((await db.execute(
        select(TriggerSituation).where(
            TriggerSituation.treatment_plan_id == plan.id,
            TriggerSituation.is_placeholder.is_(False),
        ).order_by(TriggerSituation.display_order)
    )).scalars().all())


async def _copy_estimate_to_plan(db: AsyncSession, row: PatientInsight) -> None:
    """Already on the plan: the clinician should see the parent's latest estimate there too."""
    if row.accommodation_behavior_id is None:
        return
    acc = await db.get(AccommodationBehavior, row.accommodation_behavior_id)
    if acc is not None:
        acc.parent_estimate_min = row.parent_estimate_min
        acc.parent_estimate_max = row.parent_estimate_max


async def conversation(db: AsyncSession, child: PatientProfile, plan: TreatmentPlan | None) -> dict:
    """The child's situations, each with the accommodations already known for it — from the
    parent's own monitoring log, or named by them before."""
    first_name = (child.name or "").split(" ")[0] or None
    if not plan:
        return {"child_name": first_name, "situations": []}
    situations = await plan_situations(db, plan)
    rows = (await db.execute(
        select(PatientInsight).where(
            PatientInsight.patient_id == child.id,
            PatientInsight.kind.in_([KIND_SITUATION, KIND_ACCOMMODATION]),
            PatientInsight.removed_at.is_(None),
        ).order_by(PatientInsight.first_seen_at)
    )).scalars().all()
    situation_of = {r.id: r.trigger_situation_id for r in rows if r.kind == KIND_SITUATION}
    return {
        "child_name": first_name,
        "situations": [
            {
                "id": str(t.id),
                "name": t.name,
                "items": [
                    suggestion_out(r) for r in rows
                    if r.kind == KIND_ACCOMMODATION and situation_of.get(r.parent_insight_id) == t.id
                ],
            }
            for t in situations
        ],
    }


async def answer(db: AsyncSession, child: PatientProfile, insight_id: uuid.UUID, fields: dict) -> PatientInsight:
    """"Do you still do this?" and "How hard would it be for them if you stopped?". Only on this
    child's own suggestions."""
    row = (await db.execute(
        select(PatientInsight).where(
            PatientInsight.id == insight_id,
            PatientInsight.patient_id == child.id,
            PatientInsight.kind == KIND_ACCOMMODATION,
            PatientInsight.removed_at.is_(None),
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if "still_does" in fields:
        row.still_does = fields["still_does"]
        if SOURCE_PARENT not in row.sources:
            row.sources = [*row.sources, SOURCE_PARENT]
    if "estimate_min" in fields or "estimate_max" in fields:
        rng = estimate_range(fields.get("estimate_min"), fields.get("estimate_max"))
        row.parent_estimate_min, row.parent_estimate_max = rng if rng else (None, None)
        await _copy_estimate_to_plan(db, row)
    return row


async def name_one(
    db: AsyncSession,
    child: PatientProfile,
    plan: TreatmentPlan | None,
    trigger_situation_id: uuid.UUID,
    name: str,
    estimate_min: float | None,
    estimate_max: float | None,
    user_id: uuid.UUID | None,
) -> PatientInsight:
    """Something else the parent does when one of this child's situations comes up. A suggestion,
    never a plan row. `user_id` is the parent when they typed it themselves, None in session."""
    if not plan:
        raise HTTPException(status_code=400, detail="No active plan for this child")
    situation = (await db.execute(
        select(TriggerSituation).where(
            TriggerSituation.id == trigger_situation_id,
            TriggerSituation.treatment_plan_id == plan.id,
            TriggerSituation.is_placeholder.is_(False),
        )
    )).scalar_one_or_none()
    if situation is None:
        raise HTTPException(status_code=404, detail="Situation not found")
    rng = estimate_range(estimate_min, estimate_max)
    sit = await situation_insight_for(
        db, patient_id=child.id, organization_id=child.organization_id, situation=situation)
    row = await parent_named_accommodation(
        db, patient_id=child.id, organization_id=child.organization_id,
        situation_insight=sit, name=name, user_id=user_id,
    )
    if row is None:
        raise HTTPException(status_code=422, detail="Say what they do")
    if rng:
        row.parent_estimate_min, row.parent_estimate_max = rng
        await _copy_estimate_to_plan(db, row)
    return row
