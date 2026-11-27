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

class PlanCreate(BaseModel):
    session_date: Optional[date] = None
    # Items on the last plan to carry over. The rest of the last plan is marked done.
    keep_item_ids: list[uuid.UUID] = []


class PlanUpdate(BaseModel):
    session_date: Optional[date] = None
    confidence: Optional[Literal["low", "medium", "high"]] = None


class ItemCreate(BaseModel):
    kind: Literal["exposure", "tool", "accommodation", "parent_instruction", "reward"]
    avoidance_behavior_id: Optional[uuid.UUID] = None
    accommodation_behavior_id: Optional[uuid.UUID] = None
    tool_id: Optional[uuid.UUID] = None
    tool_example_id: Optional[uuid.UUID] = None
    text: Optional[str] = None
    reward_for: Optional[str] = None
    note: Optional[str] = None
    share_with_child: bool = False


class ItemUpdate(BaseModel):
    text: Optional[str] = None
    reward_for: Optional[str] = None
    note: Optional[str] = None
    share_with_child: Optional[bool] = None
    position: Optional[int] = None


class RewardGiven(BaseModel):
    given: bool


router = APIRouter(tags=["action-plans"])


async def _plan_of(db, item: ActionPlanItem) -> ActionPlan:
    return (await db.execute(select(ActionPlan).where(ActionPlan.id == item.action_plan_id))).scalar_one()


async def _one(db, plan: ActionPlan) -> dict:
    return (await svc.plans_out(db, [plan]))[0]


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
    data: PlanCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    plan = await svc.create_plan(db, patient_id, practitioner.organization_id, practitioner.id,
                                 data.keep_item_ids, data.session_date)
    return await _one(db, plan)


@router.patch("/action-plans/{action_plan_id}")
async def update_action_plan(
    data: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    await svc.require_latest(db, plan)
    if data.session_date is not None:
        plan.session_date = data.session_date
    if data.confidence is not None:
        plan.confidence = data.confidence
    await db.commit()
    await db.refresh(plan)
    return await _one(db, plan)


@router.post("/action-plans/{action_plan_id}/publish")
async def publish_action_plan(
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    await svc.require_latest(db, plan)
    count = (await db.execute(
        select(func.count()).select_from(ActionPlanItem).where(ActionPlanItem.action_plan_id == plan.id)
    )).scalar()
    svc.publish(plan, count)
    await db.commit()
    await db.refresh(plan)
    return await _one(db, plan)


@router.delete("/action-plans/{action_plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action_plan(
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    """A draft only. A shared plan is what the family was told."""
    if plan.published_at is not None:
        raise HTTPException(status_code=409, detail="A shared action plan cannot be deleted")
    await db.delete(plan)
    await db.commit()


@router.post("/action-plans/{action_plan_id}/items", status_code=status.HTTP_201_CREATED)
async def add_action_plan_item(
    data: ItemCreate,
    db: AsyncSession = Depends(get_db),
    plan: ActionPlan = Depends(get_permitted_action_plan),
):
    await svc.require_latest(db, plan)
    await svc.add_item(db, plan, data.kind, data.model_dump())
    return await _one(db, plan)


@router.patch("/action-plan-items/{item_id}")
async def update_action_plan_item(
    data: ItemUpdate,
    db: AsyncSession = Depends(get_db),
    item: ActionPlanItem = Depends(get_permitted_action_plan_item),
):
    await svc.require_latest(db, await _plan_of(db, item))
    svc.update_item(item, data.model_dump(exclude_unset=True))
    await db.commit()
    plan = (await db.execute(select(ActionPlan).where(ActionPlan.id == item.action_plan_id))).scalar_one()
    return await _one(db, plan)


@router.delete("/action-plan-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action_plan_item(
    db: AsyncSession = Depends(get_db),
    item: ActionPlanItem = Depends(get_permitted_action_plan_item),
):
    await svc.require_latest(db, await _plan_of(db, item))
    await db.delete(item)
    await db.commit()


@router.put("/action-plan-items/{item_id}/reward-given")
async def clinician_marks_reward(
    data: RewardGiven,
    db: AsyncSession = Depends(get_db),
    item: ActionPlanItem = Depends(get_permitted_action_plan_item),
):
    """At the next session, for a reward the parent has not answered."""
    svc.mark_reward(item, data.given, "clinician")
    await db.commit()
    plan = (await db.execute(select(ActionPlan).where(ActionPlan.id == item.action_plan_id))).scalar_one()
    return await _one(db, plan)

