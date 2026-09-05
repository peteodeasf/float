import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.patient_access_service import assert_belongs_to
from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation
from app.models.downward_arrow import DownwardArrow
from app.core.behavior_types import OBSERVATION, SCENARIO
from app.services.step_suggestion_service import SuggestionUnavailable, suggest_steps
from app.api.routers.patients import get_practitioner_context, get_permitted_plan
from app.services.trigger_situation_service import (
    get_triggers_for_plan,
    create_trigger,
    update_trigger,
    delete_trigger,
    reorder_triggers
)
from app.schemas.trigger_situation import (
    TriggerSituationCreate,
    TriggerSituationUpdate,
    TriggerSituationResponse,
    ReorderRequest
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans/{plan_id}/triggers", tags=["trigger-situations"])


@router.get("", response_model=list[TriggerSituationResponse])
async def list_triggers(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await get_triggers_for_plan(db, plan_id, practitioner.organization_id)


@router.post("", response_model=TriggerSituationResponse, status_code=status.HTTP_201_CREATED)
async def create_trigger_situation(
    plan_id: uuid.UUID,
    data: TriggerSituationCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await create_trigger(db, plan_id, practitioner.organization_id, data)


@router.put("/reorder", response_model=list[TriggerSituationResponse])
async def reorder_trigger_situations(
    plan_id: uuid.UUID,
    data: ReorderRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await reorder_triggers(db, plan_id, practitioner.organization_id, data.ordered_ids)


@router.put("/{trigger_id}", response_model=TriggerSituationResponse)
async def update_trigger_situation(
    plan_id: uuid.UUID,
    trigger_id: uuid.UUID,
    data: TriggerSituationUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, TriggerSituation, trigger_id, treatment_plan_id=plan_id)
    return await update_trigger(db, trigger_id, practitioner.organization_id, data)


@router.delete("/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger_situation(
    plan_id: uuid.UUID,
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, TriggerSituation, trigger_id, treatment_plan_id=plan_id)
    await delete_trigger(db, trigger_id, practitioner.organization_id)




class SuggestedStepsResponse(BaseModel):
    """Suggestions, or the reason there are none.

    `blocked` carries a sentence for the clinician rather than an error, because the usual reason is
    a real instruction: do the downward arrow first.
    """
    suggestions: list[str] = []
    variations: str = ""
    blocked: str | None = None


@router.post("/{trigger_id}/suggested-steps", response_model=SuggestedStepsResponse)
async def suggested_steps(
    plan_id: uuid.UUID,
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """Smaller versions of this situation, for the clinician to choose from.

    Confirm-first, like the arrow probe: nothing is written. The clinician taps a suggestion to add
    it as a step, and can edit the wording before or after.
    """
    _, practitioner = context
    # Keyword, and it returns nothing — it asserts the situation is on THIS plan and 404s if not.
    await assert_belongs_to(db, TriggerSituation, trigger_id, treatment_plan_id=plan_id)
    situation = (await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == trigger_id)
    )).scalar_one()

    # What the child already does in this situation. The steps are what has been written; the
    # coping behaviours are what a suggestion must never contain — and are usually the dimension
    # worth varying instead.
    behaviors = (await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.trigger_situation_id == situation.id)
    )).scalars().all()
    steps = [b.name for b in behaviors if b.behavior_type == SCENARIO]
    coping = [
        b.name for b in behaviors
        if b.behavior_type not in (SCENARIO, OBSERVATION)
    ]

    arrow = (await db.execute(
        select(DownwardArrow).where(DownwardArrow.trigger_situation_id == situation.id)
    )).scalar_one_or_none()
    feared = arrow.feared_outcome if (arrow and arrow.feared_outcome_approved) else None

    try:
        suggestions, variations = await suggest_steps(
            situation=situation.name,
            score=float(situation.distress_thermometer_rating) if situation.distress_thermometer_rating is not None else None,
            feared_outcome=feared,
            steps=steps,
            coping=coping,
        )
    except SuggestionUnavailable as e:
        return SuggestedStepsResponse(blocked=str(e))
    except Exception as e:
        logger.exception("suggested_steps failed for situation %s", situation.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not get suggestions: {type(e).__name__}",
        ) from e

    return SuggestedStepsResponse(suggestions=suggestions, variations=variations)
