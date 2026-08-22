import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from fastapi import HTTPException, status

from app.models.treatment import TriggerSituation, TreatmentPlan, AvoidanceBehavior
from app.models.ladder import ExposureLadder, LadderRung
from app.models.notification import LadderReviewFlag
from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment, AccommodationBehavior
from app.schemas.trigger_situation import TriggerSituationCreate, TriggerSituationUpdate
from app.services.library_service import upsert_situation_library
from app.services.avoidance_behavior_service import cascade_delete_behaviors


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

    # Reuse the picked library entry, or find-or-create one from the name.
    library_id = data.situation_library_id or await upsert_situation_library(db, data.name)

    trigger = TriggerSituation(
        treatment_plan_id=plan_id,
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        distress_thermometer_rating=data.distress_thermometer_rating,
        distress_thermometer_max=data.distress_thermometer_max,
        situation_library_id=library_id,
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

    # Nothing pointing at trigger_situations cascades in the schema (only trigger_situation_tags
    # does), so this has to unwind the situation by hand — otherwise deleting any situation that
    # has been worked on at all fails with an IntegrityError. Same policy as behaviors: the
    # situation's own structure goes, outcome/parent history is unlinked rather than destroyed.
    behavior_rows = await db.execute(
        select(AvoidanceBehavior.id).where(AvoidanceBehavior.trigger_situation_id == trigger.id)
    )
    await cascade_delete_behaviors(db, list(behavior_rows.scalars().all()))

    ladder_rows = await db.execute(
        select(ExposureLadder.id).where(ExposureLadder.trigger_situation_id == trigger.id)
    )
    ladder_ids = list(ladder_rows.scalars().all())
    if ladder_ids:
        rung_rows = await db.execute(
            select(LadderRung.id).where(LadderRung.ladder_id.in_(ladder_ids))
        )
        rung_ids = list(rung_rows.scalars().all())
        if rung_ids:
            await db.execute(
                update(Experiment)
                .where(Experiment.ladder_rung_id.in_(rung_ids))
                .values(ladder_rung_id=None)
            )
            await db.execute(delete(LadderRung).where(LadderRung.id.in_(rung_ids)))
        await db.execute(delete(LadderReviewFlag).where(LadderReviewFlag.ladder_id.in_(ladder_ids)))
        await db.execute(delete(ExposureLadder).where(ExposureLadder.id.in_(ladder_ids)))

    # The downward arrow is scoped to this situation — the feared outcome has no meaning without it.
    await db.execute(
        delete(DownwardArrow).where(DownwardArrow.trigger_situation_id == trigger.id)
    )

    # History that merely references the situation keeps its own record; only the link goes.
    await db.execute(
        update(Experiment)
        .where(Experiment.trigger_situation_id == trigger.id)
        .values(trigger_situation_id=None)
    )
    await db.execute(
        update(AccommodationBehavior)
        .where(AccommodationBehavior.trigger_situation_id == trigger.id)
        .values(trigger_situation_id=None)
    )

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
