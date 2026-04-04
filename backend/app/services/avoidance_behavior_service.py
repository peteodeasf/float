import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.treatment import AvoidanceBehavior
from app.schemas.avoidance_behavior import AvoidanceBehaviorCreate, AvoidanceBehaviorUpdate


async def get_behaviors_for_trigger(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID
) -> list[AvoidanceBehavior]:
    result = await db.execute(
        select(AvoidanceBehavior)
        .where(
            AvoidanceBehavior.trigger_situation_id == trigger_id,
            AvoidanceBehavior.organization_id == organization_id
        )
        .order_by(AvoidanceBehavior.created_at)
    )
    return result.scalars().all()


async def create_behavior(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: AvoidanceBehaviorCreate
) -> AvoidanceBehavior:
    behavior = AvoidanceBehavior(
        trigger_situation_id=trigger_id,
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        behavior_type=data.behavior_type,
        distress_thermometer_when_refraining=data.distress_thermometer_when_refraining
    )
    db.add(behavior)
    await db.commit()
    await db.refresh(behavior)
    return behavior


async def update_behavior(
    db: AsyncSession,
    behavior_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: AvoidanceBehaviorUpdate
) -> AvoidanceBehavior:
    result = await db.execute(
        select(AvoidanceBehavior)
        .where(
            AvoidanceBehavior.id == behavior_id,
            AvoidanceBehavior.organization_id == organization_id
        )
    )
    behavior = result.scalar_one_or_none()
    if not behavior:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior not found")

    if data.name is not None:
        behavior.name = data.name
    if data.description is not None:
        behavior.description = data.description
    if data.behavior_type is not None:
        behavior.behavior_type = data.behavior_type
    if data.distress_thermometer_when_refraining is not None:
        behavior.distress_thermometer_when_refraining = data.distress_thermometer_when_refraining

    await db.commit()
    await db.refresh(behavior)
    return behavior


async def delete_behavior(
    db: AsyncSession,
    behavior_id: uuid.UUID,
    organization_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(AvoidanceBehavior)
        .where(
            AvoidanceBehavior.id == behavior_id,
            AvoidanceBehavior.organization_id == organization_id
        )
    )
    behavior = result.scalar_one_or_none()
    if not behavior:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior not found")
    await db.delete(behavior)
    await db.commit()
