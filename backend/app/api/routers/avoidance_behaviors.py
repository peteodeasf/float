import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.avoidance_behavior_service import (
    get_behaviors_for_trigger,
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
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_behaviors_for_trigger(db, trigger_id, practitioner.organization_id)


@router.post("", response_model=AvoidanceBehaviorResponse, status_code=status.HTTP_201_CREATED)
async def create_avoidance_behavior(
    trigger_id: uuid.UUID,
    data: AvoidanceBehaviorCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await create_behavior(db, trigger_id, practitioner.organization_id, data)


@router.put("/{behavior_id}", response_model=AvoidanceBehaviorResponse)
async def update_avoidance_behavior(
    trigger_id: uuid.UUID,
    behavior_id: uuid.UUID,
    data: AvoidanceBehaviorUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await update_behavior(db, behavior_id, practitioner.organization_id, data)


@router.delete("/{behavior_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avoidance_behavior(
    trigger_id: uuid.UUID,
    behavior_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    await delete_behavior(db, behavior_id, practitioner.organization_id)
