import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from fastapi import HTTPException, status

from app.models.treatment import AvoidanceBehavior
from app.models.ladder import LadderRung
from app.models.experiment import Experiment
from app.schemas.avoidance_behavior import AvoidanceBehaviorCreate, AvoidanceBehaviorUpdate
from app.services.library_service import upsert_behavior_library


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
    # Reuse the picked library entry, or find-or-create one from the name + type.
    library_id = data.behavior_library_id or await upsert_behavior_library(
        db, data.name, data.behavior_type
    )

    behavior = AvoidanceBehavior(
        trigger_situation_id=trigger_id,
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        behavior_type=data.behavior_type,
        distress_thermometer_when_refraining=data.distress_thermometer_when_refraining,
        behavior_library_id=library_id,
        parent_behavior_id=data.parent_behavior_id,
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


async def cascade_delete_behaviors(
    db: AsyncSession,
    behavior_ids: list[uuid.UUID]
) -> None:
    """Delete behaviors, their sub-behaviors, and everything that structurally depends on them.

    None of the FKs pointing at ``avoidance_behaviors`` are ``ON DELETE`` anything, so a plain
    ``db.delete(behavior)`` raises an IntegrityError as soon as a behavior has a sub-step, a ladder
    rung, or an experiment. Policy:

    * **Sub-behaviors and ladder rungs are structure** — they only exist to describe this behavior,
      so they go with it.
    * **Experiments are outcome history** — what the child actually did is not erased by removing a
      rung; the link is nulled instead (both FKs are nullable).

    Does not commit — the caller owns the transaction.
    """
    if not behavior_ids:
        return

    # Sub-behaviors are a self-FK, so walk down until the tree is exhausted (v1 nests one level,
    # but the walk costs nothing and keeps this correct if that ever changes).
    all_ids: set[uuid.UUID] = set(behavior_ids)
    frontier = list(behavior_ids)
    while frontier:
        rows = await db.execute(
            select(AvoidanceBehavior.id).where(AvoidanceBehavior.parent_behavior_id.in_(frontier))
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
