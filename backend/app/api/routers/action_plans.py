"""Action plans, clinician side. docs/plans/action-plans-build.md

The parent's and the child's routes are in parent.py and patients.py; the tools list's admin
routes are in admin.py.
"""
import uuid
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.action_plan import ActionPlan, ActionPlanItem
from app.models.patient import PatientProfile
from app.schemas.experiment import ExperimentAfterState
from app.services.experiment_service import record_for_child
from app.api.routers.patients import get_practitioner_context, get_permitted_patient
from app.services import action_plan_service as svc
from app.services.patient_access_service import get_patient_for_practitioner, patient_of_record


# --- Access: an action plan, or an item on one, resolves to its patient first ---

async def get_permitted_action_plan(
    action_plan_id: uuid.UUID,
    request: Request,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
) -> ActionPlan:
    user, practitioner = context
    patient_id = await patient_of_record(db, ActionPlan, action_plan_id)
    await get_patient_for_practitioner(db, patient_id, user.id, practitioner, request)
    return (await db.execute(select(ActionPlan).where(ActionPlan.id == action_plan_id))).scalar_one()


async def get_permitted_action_plan_item(
    item_id: uuid.UUID,
    request: Request,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
) -> ActionPlanItem:
    user, practitioner = context
    item = (await db.execute(select(ActionPlanItem).where(ActionPlanItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise svc._404("Item")
    patient_id = await patient_of_record(db, ActionPlan, item.action_plan_id)
    await get_patient_for_practitioner(db, patient_id, user.id, practitioner, request)
    return item


# --- Schemas ---

class ItemIn(BaseModel):
    id: Optional[uuid.UUID] = None  # a line already on the plan, keeping its ticks and notes
    kind: Literal["exposure", "tool", "accommodation", "parent_instruction", "reward"]
    avoidance_behavior_id: Optional[uuid.UUID] = None
    accommodation_behavior_id: Optional[uuid.UUID] = None
    tool_id: Optional[uuid.UUID] = None
    tool_example_id: Optional[uuid.UUID] = None
    text: Optional[str] = None
    reward_for: Optional[str] = None
    note: Optional[str] = None
    share_with_child: bool = False
    parent_only: bool = False  # a written-in tool under the parent's section


class PlanIn(BaseModel):
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    items: list[ItemIn]
    # Save draft: the family does not see it yet. Ignored on a plan already shared.
    draft: bool = False


class TickIn(BaseModel):
    done: bool


class CheckNoteIn(BaseModel):
    note: Optional[str] = None


router = APIRouter(tags=["action-plans"])


async def _one(db, plan: ActionPlan) -> dict:
    return (await svc.plans_out(db, [plan]))[0]


async def _plan_of(db, item: ActionPlanItem) -> ActionPlan:
    return (await db.execute(select(ActionPlan).where(ActionPlan.id == item.action_plan_id))).scalar_one()


def _items(data: PlanIn) -> list[dict]:
    return [{k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in i.model_dump().items()} for i in data.items]


@router.get("/patients/{patient_id}/action-plans")
async def list_action_plans(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    plans = await svc.list_for_patient(db, patient_id, practitioner.organization_id)
    return await svc.plans_out(db, plans)


@router.post("/patients/{patient_id}/action-plans", status_code=status.HTTP_201_CREATED)
async def create_action_plan(
    patient_id: uuid.UUID,
    data: PlanIn,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """A new plan, saved whole: a draft, or shared so the family sees it straight away."""
    _, practitioner = context
    plan = await svc.create_plan(db, patient_id, practitioner.organization_id, practitioner.id,
                                 data.starts_on, data.ends_on, _items(data), draft=data.draft)
    return await _one(db, plan)


@router.put("/action-plans/{action_plan_id}")
async def save_action_plan(
    data: PlanIn,
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    """The edit view's Save: the plan's dates and lines, whole."""
    plan = await svc.save_plan(db, plan, data.starts_on, data.ends_on, _items(data), draft=data.draft)
    return await _one(db, plan)


@router.post("/action-plans/{action_plan_id}/share")
async def share_action_plan(
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    """A draft's Share with family: refused until every line is complete."""
    plan = await svc.share_plan(db, plan)
    return await _one(db, plan)


@router.put("/action-plan-items/{item_id}/tick")
async def clinician_tick(
    data: TickIn,
    db: AsyncSession = Depends(get_db),
    item: ActionPlanItem = Depends(get_permitted_action_plan_item),
):
    """Checking in: the clinician ticks any line but an exposure, on a current or closed plan."""
    svc.tick(item, data.done, "clinician")
    await db.commit()
    return await _one(db, await _plan_of(db, item))


@router.put("/action-plan-items/{item_id}/check-note")
async def clinician_check_note(
    data: CheckNoteIn,
    db: AsyncSession = Depends(get_db),
    item: ActionPlanItem = Depends(get_permitted_action_plan_item),
):
    """A check-in note. The clinician's alone: never sent to the family's apps."""
    item.check_note = (data.note or "").strip() or None
    await db.commit()
    return await _one(db, await _plan_of(db, item))


@router.post("/patients/{patient_id}/exposures/{rung_id}/record", status_code=status.HTTP_201_CREATED)
async def clinician_records_exposure(
    patient_id: uuid.UUID,
    rung_id: uuid.UUID,
    data: ExperimentAfterState,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """The clinician records how an exposure went, with the questions the child answers in their app.
    Against the step's set-up exposure; if there is none (the last one was recorded already), a new one
    with the same set-up answers."""
    _, practitioner = context
    exp = await record_for_child(db, patient_id, practitioner.organization_id, rung_id, data)
    return {"id": str(exp.id), "status": exp.status}
