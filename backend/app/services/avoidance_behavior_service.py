import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, or_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.treatment import AvoidanceBehavior, TriggerSituation
from app.models.ladder import LadderRung
from app.models.experiment import Experiment
from app.schemas.avoidance_behavior import AvoidanceBehaviorCreate, AvoidanceBehaviorUpdate
from app.services.library_service import upsert_behavior_library
from app.core.behavior_types import COMBINATION, COMBINATION_OF, LADDER_TYPES, coerce_for_write


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
    trigger_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    data: AvoidanceBehaviorCreate,
    plan_id: uuid.UUID | None = None,
) -> AvoidanceBehavior:
    behavior_type = coerce_for_write(data.behavior_type)
    if behavior_type == COMBINATION:
        await _check_combination(db, trigger_id, organization_id, data.without_behavior_id)
        # A combination sentence is this child's situation and behaviour put together. It is not
        # a reusable name, so it stays out of the shared cross-practice library.
        library_id = None
    else:
        if data.without_behavior_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only a combination can say which behaviour it is without.",
            )
        # Reuse the picked library entry, or find-or-create one from the name + type.
        library_id = data.behavior_library_id or await upsert_behavior_library(
            db, data.name, data.behavior_type
        )

    # A rung always belongs to a plan; the situation is optional grouping. If the caller gave a
    # situation but no plan, take the plan from the situation so the link is never missing.
    if plan_id is None and trigger_id is not None:
        plan_id = (await db.execute(
            select(TriggerSituation.treatment_plan_id).where(TriggerSituation.id == trigger_id)
        )).scalar_one_or_none()

    behavior = AvoidanceBehavior(
        trigger_situation_id=trigger_id,
        treatment_plan_id=plan_id,
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        behavior_type=behavior_type,
        distress_thermometer_when_refraining=data.distress_thermometer_when_refraining,
        behavior_library_id=library_id,
        parent_behavior_id=data.parent_behavior_id,
        without_behavior_id=data.without_behavior_id,
    )
    db.add(behavior)
    try:
        await db.commit()
    except IntegrityError:
        # Two saves of the same combination at once both pass the check above; the unique index
        # stops the second. Say what happened rather than returning a 500.
        await db.rollback()
        if behavior_type == COMBINATION:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This safety behaviour already has a combination.",
            )
        raise
    await db.refresh(behavior)
    return behavior


async def _check_combination(
    db: AsyncSession,
    trigger_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    without_behavior_id: uuid.UUID | None,
) -> None:
    """A combination needs a safety behaviour, on the same situation, that has no combination yet.

    Only safety behaviours make combinations. Peter, 2026-10-15, on avoidance: "It's avoiding the
    situation." See docs/plans/ladder-combinations.md.
    """
    if trigger_id is None or without_behavior_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A combination needs its situation and the safety behaviour it is without.",
        )
    target = (await db.execute(
        select(AvoidanceBehavior).where(
            AvoidanceBehavior.id == without_behavior_id,
            AvoidanceBehavior.organization_id == organization_id,
            AvoidanceBehavior.trigger_situation_id == trigger_id,
        )
    )).scalar_one_or_none()
    if target is None:
        # Same answer whether it does not exist or is under another situation, so this cannot be
        # used to find out whether a row exists somewhere else.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior not found")
    if target.behavior_type != COMBINATION_OF:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a safety behaviour makes a combination.",
        )
    if await _has_combination(db, without_behavior_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This safety behaviour already has a combination.",
        )


async def _has_combination(db: AsyncSession, behavior_id: uuid.UUID) -> bool:
    return (await db.execute(
        select(AvoidanceBehavior.id).where(AvoidanceBehavior.without_behavior_id == behavior_id)
    )).scalar_one_or_none() is not None


async def _check_type_change(db: AsyncSession, behavior: AvoidanceBehavior, new_type: str) -> None:
    """Refuse a type change that would break a combination.

    A row cannot become a combination by retyping, because it would have no behaviour to be
    without. A combination cannot become something else, because it would keep pointing at one. A
    safety behaviour with a combination cannot stop being safety, because the combination would
    then be "without" something that is not a safety behaviour.
    """
    if new_type == COMBINATION or behavior.behavior_type == COMBINATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A combination is made from a safety behaviour, not by changing a type.",
        )
    if behavior.behavior_type == COMBINATION_OF:
        if await _has_combination(db, behavior.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This safety behaviour has a combination. Remove the combination first.",
            )


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
        new_type = coerce_for_write(data.behavior_type)
        if new_type != behavior.behavior_type:
            await _check_type_change(db, behavior, new_type)
        behavior.behavior_type = new_type
    if data.distress_thermometer_when_refraining is not None:
        behavior.distress_thermometer_when_refraining = data.distress_thermometer_when_refraining
    # Regrouping. None is meaningful (ungroup), so this keys off "was the field sent at all".
    fields_sent = data.model_dump(exclude_unset=True)
    new_situation = fields_sent.get("trigger_situation_id", behavior.trigger_situation_id)
    if new_situation != behavior.trigger_situation_id:
        if behavior.behavior_type == COMBINATION:
            # A combination is this situation without one of its behaviours. Under another
            # situation, or none, the sentence would describe something that is not there.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A combination stays with its situation.",
            )
        if await _has_combination(db, behavior.id):
            # The other half of the same rule: its combination would be left saying "without"
            # something that is no longer part of that situation.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This safety behaviour has a combination. Remove the combination first.",
            )
        behavior.trigger_situation_id = new_situation

    await db.commit()
    await db.refresh(behavior)
    return behavior


async def cascade_delete_behaviors(
    db: AsyncSession,
    behavior_ids: list[uuid.UUID]
) -> None:
    """Delete behaviors, their sub-behaviors, and everything that structurally depends on them.

    None of the FKs pointing at ``avoidance_behaviors`` are ``ON DELETE`` anything, so a plain
    ``db.delete(behavior)`` raises an IntegrityError as soon as a behavior has a sub-step, a ladder
    rung, or an experiment. Policy:

    * **Sub-behaviors, combinations and ladder rungs are structure** — they only exist to describe this behavior,
      so they go with it.
    * **Experiments are outcome history** — what the child actually did is not erased by removing a
      rung; the link is nulled instead (both FKs are nullable).

    Does not commit — the caller owns the transaction.
    """
    if not behavior_ids:
        return

    # Sub-behaviors are a self-FK, so walk down until the tree is exhausted (v1 nests one level,
    # but the walk costs nothing and keeps this correct if that ever changes).
    # A safety behaviour's combination is structure too: "without X" means nothing once X is gone.
    all_ids: set[uuid.UUID] = set(behavior_ids)
    frontier = list(behavior_ids)
    while frontier:
        rows = await db.execute(
            select(AvoidanceBehavior.id).where(or_(
                AvoidanceBehavior.parent_behavior_id.in_(frontier),
                AvoidanceBehavior.without_behavior_id.in_(frontier),
            ))
        )
        frontier = [bid for bid in rows.scalars().all() if bid not in all_ids]
        all_ids.update(frontier)

    ids = list(all_ids)

    rung_rows = await db.execute(
        select(LadderRung.id).where(LadderRung.avoidance_behavior_id.in_(ids))
    )
    rung_ids = list(rung_rows.scalars().all())

    await db.execute(
        update(Experiment)
        .where(Experiment.avoidance_behavior_id.in_(ids))
        .values(avoidance_behavior_id=None)
    )
    if rung_ids:
        await db.execute(
            update(Experiment)
            .where(Experiment.ladder_rung_id.in_(rung_ids))
            .values(ladder_rung_id=None)
        )
        await db.execute(delete(LadderRung).where(LadderRung.id.in_(rung_ids)))

    # A step's downward arrow goes with the step, the same as a situation's arrow goes with the
    # situation: the feared outcome has no meaning without what it was about.
    from app.models.downward_arrow import DownwardArrow
    await db.execute(delete(DownwardArrow).where(DownwardArrow.rung_id.in_(ids)))

    await db.execute(delete(AvoidanceBehavior).where(AvoidanceBehavior.id.in_(ids)))


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
    await cascade_delete_behaviors(db, [behavior.id])
    await db.commit()


async def get_rungs_for_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[AvoidanceBehavior]:
    """Every rung on a plan's ladder, grouped or not.

    Covers rows written before `treatment_plan_id` existed by also matching through the situation,
    so the flat ladder never silently omits older rungs.
    """
    situation_ids = select(TriggerSituation.id).where(
        TriggerSituation.treatment_plan_id == plan_id
    )
    result = await db.execute(
        select(AvoidanceBehavior)
        .where(
            # An observation is not a step anyone can climb. Nine rows arrived in this table from
            # monitoring extraction — "Complained of stomach pain" — and were showing on ladders.
            AvoidanceBehavior.behavior_type.in_(LADDER_TYPES),
            AvoidanceBehavior.organization_id == organization_id,
            or_(
                AvoidanceBehavior.treatment_plan_id == plan_id,
                AvoidanceBehavior.trigger_situation_id.in_(situation_ids),
            ),
        )
        .order_by(AvoidanceBehavior.distress_thermometer_when_refraining.nulls_last(),
                  AvoidanceBehavior.created_at)
    )
    return list(result.scalars().all())


async def assert_rung_in_plan(db: AsyncSession, behavior_id: uuid.UUID, plan_id: uuid.UUID) -> None:
    """404 unless this rung is on this plan's ladder.

    Matches the same way `get_rungs_for_plan` does - through the plan directly, or through a
    situation on that plan for rows written before `treatment_plan_id` existed. A stricter check
    would 404 on legitimate older rungs.
    """
    from fastapi import HTTPException, status as http_status
    situation_ids = select(TriggerSituation.id).where(
        TriggerSituation.treatment_plan_id == plan_id
    )
    result = await db.execute(
        select(AvoidanceBehavior.id).where(
            AvoidanceBehavior.id == behavior_id,
            or_(
                AvoidanceBehavior.treatment_plan_id == plan_id,
                AvoidanceBehavior.trigger_situation_id.in_(situation_ids),
            ),
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Rung not found")
