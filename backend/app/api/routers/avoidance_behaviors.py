import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.patient_access_service import assert_belongs_to
from app.services.ladder_review_service import review_steps
from app.models.treatment import TreatmentPlan, AvoidanceBehavior
from app.api.routers.patients import get_practitioner_context, get_permitted_plan, get_permitted_trigger
from app.services.avoidance_behavior_service import (
    assert_rung_in_plan,
    get_behaviors_for_trigger,
    get_rungs_for_plan,
    create_behavior,
    update_behavior,
    delete_behavior
)
from app.schemas.avoidance_behavior import (
    AvoidanceBehaviorCreate,
    AvoidanceBehaviorUpdate,
    AvoidanceBehaviorResponse
)

router = APIRouter(prefix="/triggers/{trigger_id}/behaviors", tags=["avoidance-behaviors"])


@router.get("", response_model=list[AvoidanceBehaviorResponse])
async def list_behaviors(
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_trigger),
):
    _, practitioner = context
    return await get_behaviors_for_trigger(db, trigger_id, practitioner.organization_id)


@router.post("", response_model=AvoidanceBehaviorResponse, status_code=status.HTTP_201_CREATED)
async def create_avoidance_behavior(
    trigger_id: uuid.UUID,
    data: AvoidanceBehaviorCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_trigger),
):
    _, practitioner = context
    return await create_behavior(db, trigger_id, practitioner.organization_id, data)


@router.put("/{behavior_id}", response_model=AvoidanceBehaviorResponse)
async def update_avoidance_behavior(
    trigger_id: uuid.UUID,
    behavior_id: uuid.UUID,
    data: AvoidanceBehaviorUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_trigger),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, AvoidanceBehavior, behavior_id, trigger_situation_id=trigger_id)
    return await update_behavior(db, behavior_id, practitioner.organization_id, data)


@router.delete("/{behavior_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avoidance_behavior(
    trigger_id: uuid.UUID,
    behavior_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_trigger),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, AvoidanceBehavior, behavior_id, trigger_situation_id=trigger_id)
    await delete_behavior(db, behavior_id, practitioner.organization_id)


# ── The ladder, flat ───────────────────────────────────────────────────────────
# Every rung on a plan, grouped or not, ordered by score. The per-trigger routes above stay —
# they are how a situation's own rungs are read, and the teen app and session mode use them.
plan_rungs_router = APIRouter(prefix="/plans/{plan_id}/rungs", tags=["avoidance-behaviors"])
# Its own prefix, not a path under /rungs — a literal segment declared after /rungs/{rung_id} is
# captured as a rung id and 422s. That has bitten this file before.
ladder_review_router = APIRouter(prefix="/plans/{plan_id}/ladder-review", tags=["avoidance-behaviors"])


@plan_rungs_router.get("", response_model=list[AvoidanceBehaviorResponse])
async def list_plan_rungs(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await get_rungs_for_plan(db, plan_id, practitioner.organization_id)


@plan_rungs_router.post("", response_model=AvoidanceBehaviorResponse, status_code=status.HTTP_201_CREATED)
async def create_plan_rung(
    plan_id: uuid.UUID,
    data: AvoidanceBehaviorCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """Add a rung to the ladder. `trigger_situation_id` is optional — group it now or later."""
    _, practitioner = context
    return await create_behavior(
        db, data.trigger_situation_id, practitioner.organization_id, data, plan_id=plan_id
    )


@plan_rungs_router.put("/{rung_id}", response_model=AvoidanceBehaviorResponse)
async def update_plan_rung(
    plan_id: uuid.UUID,
    rung_id: uuid.UUID,
    data: AvoidanceBehaviorUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """Edit a rung, including regrouping it. An ungrouped rung has no trigger to route through."""
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_rung_in_plan(db, rung_id, plan_id)
    return await update_behavior(db, rung_id, practitioner.organization_id, data)


@plan_rungs_router.delete("/{rung_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan_rung(
    plan_id: uuid.UUID,
    rung_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_rung_in_plan(db, rung_id, plan_id)
    await delete_behavior(db, rung_id, practitioner.organization_id)


class LadderReviewFinding(BaseModel):
    code: str
    message: str


class LadderReviewResponse(BaseModel):
    findings: list[LadderReviewFinding] = []
    #: The judgement half — does a step keep a safety behaviour, is there a way out built into it —
    #: is not built. Said plainly so a clinician does not read a clean result as "it has been read".
    ai_pending: bool = True


@ladder_review_router.get("", response_model=LadderReviewResponse)
async def review_plan_ladder(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """Check the ladder before the clinician closes the editor.

    Arithmetic only, against Dr. Walker's parameters in `LADDER_RULES`: is the easiest step low
    enough to start on, are there enough steps, is any jump between two of them too big, is anything
    unscored.
    """
    _, practitioner = context
    rungs = await get_rungs_for_plan(db, plan_id, practitioner.organization_id)
    steps = [
        (r.name, float(r.distress_thermometer_when_refraining) if r.distress_thermometer_when_refraining is not None else None)
        for r in rungs
    ]
    return LadderReviewResponse(
        findings=[LadderReviewFinding(code=f.code, message=f.message) for f in review_steps(steps)],
    )
