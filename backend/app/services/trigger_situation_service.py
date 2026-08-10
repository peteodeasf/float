import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status

from app.models.treatment import TriggerSituation, TreatmentPlan, AvoidanceBehavior
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
        distress_thermometer_max=data.distress_thermometer_max,
        display_order=next_order,
        is_active=data.is_active if data.is_active is not None else False,
        is_placeholder=data.is_placeholder if data.is_placeholder is not None else False
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
    if data.distress_thermometer_max is not None:
        trigger.distress_thermometer_max = data.distress_thermometer_max
    if data.is_active is not None:
        # A situation with no behaviors has nothing for the teen to work on —
        # the ladder skips it entirely — so it can't be activated.
        if data.is_active and not trigger.is_active:
            behavior_count = (await db.execute(
                select(func.count()).select_from(AvoidanceBehavior).where(
                    AvoidanceBehavior.trigger_situation_id == trigger.id
                )
            )).scalar_one()
            if behavior_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Add at least one behavior before activating this situation.",
                )
        trigger.is_active = data.is_active
        # Activating a situation is what "starts" treatment — there is no
        # separate clinician "activate plan" step. The first situation turned
        # on flips the plan to active and stamps activated_at (the real
        # treatment-start data point) once, and never again.
        if data.is_active:
            plan = (await db.execute(
                select(TreatmentPlan).where(TreatmentPlan.id == trigger.treatment_plan_id)
            )).scalar_one_or_none()
            if plan and plan.status != "active":
                plan.status = "active"
                if plan.activated_at is None:
                    plan.activated_at = datetime.now(timezone.utc)

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
