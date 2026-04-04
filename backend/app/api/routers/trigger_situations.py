import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
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

router = APIRouter(prefix="/plans/{plan_id}/triggers", tags=["trigger-situations"])


@router.get("", response_model=list[TriggerSituationResponse])
async def list_triggers(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_triggers_for_plan(db, plan_id, practitioner.organization_id)


@router.post("", response_model=TriggerSituationResponse, status_code=status.HTTP_201_CREATED)
async def create_trigger_situation(
    plan_id: uuid.UUID,
    data: TriggerSituationCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await create_trigger(db, plan_id, practitioner.organization_id, data)


@router.put("/{trigger_id}", response_model=TriggerSituationResponse)
async def update_trigger_situation(
    plan_id: uuid.UUID,
    trigger_id: uuid.UUID,
    data: TriggerSituationUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await update_trigger(db, trigger_id, practitioner.organization_id, data)


@router.delete("/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger_situation(
    plan_id: uuid.UUID,
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    await delete_trigger(db, trigger_id, practitioner.organization_id)


@router.put("/reorder", response_model=list[TriggerSituationResponse])
async def reorder_trigger_situations(
    plan_id: uuid.UUID,
    data: ReorderRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await reorder_triggers(db, plan_id, practitioner.organization_id, data.ordered_ids)
