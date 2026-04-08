import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.action_plan import ActionPlan
from app.models.user import User
from app.models.patient import PractitionerProfile
from app.api.routers.patients import get_practitioner_context


# --- Schemas ---

class ActionPlanCreate(BaseModel):
    session_date: Optional[date] = None
    nickname: Optional[str] = None
    exposures: list[str] = []
    behaviors_to_resist: list[str] = []
    parent_instructions: list[str] = []
    coping_tools: list[str] = []
    cognitive_strategies: list[str] = []
    additional_notes: Optional[str] = None
    next_appointment: Optional[str] = None


class ActionPlanUpdate(BaseModel):
    session_date: Optional[date] = None
    nickname: Optional[str] = None
    exposures: Optional[list[str]] = None
    behaviors_to_resist: Optional[list[str]] = None
    parent_instructions: Optional[list[str]] = None
    coping_tools: Optional[list[str]] = None
    cognitive_strategies: Optional[list[str]] = None
    additional_notes: Optional[str] = None
    next_appointment: Optional[str] = None


class ActionPlanResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    organization_id: uuid.UUID
    practitioner_id: uuid.UUID
    session_number: int
    session_date: date
    nickname: Optional[str]
    exposures: list[str]
    behaviors_to_resist: list[str]
    parent_instructions: list[str]
    coping_tools: list[str]
    cognitive_strategies: list[str]
    additional_notes: Optional[str]
    next_appointment: Optional[str]
    visible_to_patient: bool
    visible_to_parent: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Router ---

router = APIRouter(tags=["action-plans"])


@router.get(
    "/patients/{patient_id}/action-plans",
    response_model=list[ActionPlanResponse]
)
async def list_action_plans(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ActionPlan)
        .where(
            ActionPlan.patient_id == patient_id,
            ActionPlan.organization_id == practitioner.organization_id
        )
        .order_by(ActionPlan.session_number.desc())
    )
    return result.scalars().all()


@router.post(
    "/patients/{patient_id}/action-plans",
    response_model=ActionPlanResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_action_plan(
    patient_id: uuid.UUID,
    data: ActionPlanCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context

    # Auto-increment session_number per patient
    result = await db.execute(
        select(func.coalesce(func.max(ActionPlan.session_number), 0))
        .where(
            ActionPlan.patient_id == patient_id,
            ActionPlan.organization_id == practitioner.organization_id
        )
    )
    next_number = result.scalar() + 1

    plan = ActionPlan(
        patient_id=patient_id,
        organization_id=practitioner.organization_id,
        practitioner_id=practitioner.id,
        session_number=next_number,
        session_date=data.session_date or date.today(),
        nickname=data.nickname,
        exposures=data.exposures,
        behaviors_to_resist=data.behaviors_to_resist,
        parent_instructions=data.parent_instructions,
        coping_tools=data.coping_tools,
        cognitive_strategies=data.cognitive_strategies,
        additional_notes=data.additional_notes,
        next_appointment=data.next_appointment,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put(
    "/action-plans/{plan_id}",
    response_model=ActionPlanResponse
)
async def update_action_plan(
    plan_id: uuid.UUID,
    data: ActionPlanUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ActionPlan).where(
            ActionPlan.id == plan_id,
            ActionPlan.organization_id == practitioner.organization_id
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action plan not found"
        )

    if data.session_date is not None:
        plan.session_date = data.session_date
    if data.nickname is not None:
        plan.nickname = data.nickname
    if data.exposures is not None:
        plan.exposures = data.exposures
    if data.behaviors_to_resist is not None:
        plan.behaviors_to_resist = data.behaviors_to_resist
    if data.parent_instructions is not None:
        plan.parent_instructions = data.parent_instructions
    if data.coping_tools is not None:
        plan.coping_tools = data.coping_tools
    if data.cognitive_strategies is not None:
        plan.cognitive_strategies = data.cognitive_strategies
    if data.additional_notes is not None:
        plan.additional_notes = data.additional_notes
    if data.next_appointment is not None:
        plan.next_appointment = data.next_appointment

    await db.commit()
    await db.refresh(plan)
    return plan


@router.put(
    "/action-plans/{plan_id}/publish",
    response_model=ActionPlanResponse
)
async def publish_action_plan(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ActionPlan).where(
            ActionPlan.id == plan_id,
            ActionPlan.organization_id == practitioner.organization_id
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action plan not found"
        )

    plan.visible_to_patient = True
    plan.visible_to_parent = True
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete(
    "/action-plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_action_plan(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ActionPlan).where(
            ActionPlan.id == plan_id,
            ActionPlan.organization_id == practitioner.organization_id
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action plan not found"
        )

    await db.delete(plan)
    await db.commit()
