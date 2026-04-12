import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.treatment import TriggerSituation
from app.schemas.trigger_situation import TriggerSituationCreate, TriggerSituationUpdate


async def get_triggers_for_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID
) -> list[TriggerSituation]:
    result = await db.execute(
        select(TriggerSituation)
        .where(
            TriggerSituation.treatment_plan_id == plan_id,
            TriggerSituation.organization_id == organization_id
        )
        .order_by(TriggerSituation.display_order)
    )
    return result.scalars().all()


async def create_trigger(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TriggerSituationCreate
) -> TriggerSituation:
    # Get current max order
    result = await db.execute(
        select(TriggerSituation)
        .where(TriggerSituation.treatment_plan_id == plan_id)
        .order_by(TriggerSituation.display_order.desc())
    )
    existing = result.scalars().all()
    next_order = len(existing)

    trigger = TriggerSituation(
        treatment_plan_id=plan_id,
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        distress_thermometer_rating=data.distress_thermometer_rating,
        display_order=next_order,
        is_active=data.is_active if data.is_active is not None else False
    )
    db.add(trigger)
    await db.commit()
    await db.refresh(trigger)
    return trigger


async def update_trigger(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TriggerSituationUpdate
) -> TriggerSituation:
    result = await db.execute(
        select(TriggerSituation)
        .where(
            TriggerSituation.id == trigger_id,
            TriggerSituation.organization_id == organization_id
        )
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trigger not found")

    if data.name is not None:
        trigger.name = data.name
    if data.description is not None:
        trigger.description = data.description
    if data.distress_thermometer_rating is not None:
        trigger.distress_thermometer_rating = data.distress_thermometer_rating
    if data.is_active is not None:
        trigger.is_active = data.is_active

    await db.commit()
    await db.refresh(trigger)
    return trigger


async def delete_trigger(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(TriggerSituation)
        .where(
            TriggerSituation.id == trigger_id,
            TriggerSituation.organization_id == organization_id
        )
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trigger not found")
    await db.delete(trigger)
    await db.commit()


async def reorder_triggers(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    ordered_ids: list[uuid.UUID]
) -> list[TriggerSituation]:
    result = await db.execute(
        select(TriggerSituation)
        .where(
            TriggerSituation.treatment_plan_id == plan_id,
            TriggerSituation.organization_id == organization_id
        )
    )
    triggers = {t.id: t for t in result.scalars().all()}

    for order, trigger_id in enumerate(ordered_ids):
        if trigger_id in triggers:
            triggers[trigger_id].display_order = order

    await db.commit()
    return list(triggers.values())
