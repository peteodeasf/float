import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.ladder import ExposureLadder, LadderRung
from app.schemas.ladder import LadderRungCreate, LadderRungUpdate


async def get_or_create_ladder(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID
) -> ExposureLadder:
    result = await db.execute(
        select(ExposureLadder)
        .where(
            ExposureLadder.trigger_situation_id == trigger_id,
            ExposureLadder.organization_id == organization_id
        )
    )
    ladder = result.scalar_one_or_none()
    if not ladder:
        ladder = ExposureLadder(
            trigger_situation_id=trigger_id,
            organization_id=organization_id,
            status="not_started",
            review_status="pending"
        )
        db.add(ladder)
        await db.commit()
        await db.refresh(ladder)
    return ladder


async def get_ladder_with_rungs(
    db: AsyncSession,
    trigger_id: uuid.UUID,
    organization_id: uuid.UUID
) -> ExposureLadder | None:
    result = await db.execute(
        select(ExposureLadder)
        .where(
            ExposureLadder.trigger_situation_id == trigger_id,
            ExposureLadder.organization_id == organization_id
        )
    )
    ladder = result.scalar_one_or_none()
    if not ladder:
        return None

    rungs_result = await db.execute(
        select(LadderRung)
        .where(LadderRung.ladder_id == ladder.id)
        .order_by(LadderRung.rung_order)
    )
    ladder.rungs = rungs_result.scalars().all()
    return ladder


async def add_rung(
    db: AsyncSession,
    ladder_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: LadderRungCreate
) -> LadderRung:
    rung = LadderRung(
        ladder_id=ladder_id,
        organization_id=organization_id,
        avoidance_behavior_id=data.avoidance_behavior_id,
        distress_thermometer_rating=data.distress_thermometer_rating,
        rung_order=data.rung_order,
        status="not_started"
    )
    db.add(rung)
    await db.commit()
    await db.refresh(rung)
    return rung


async def update_rung(
    db: AsyncSession,
    rung_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: LadderRungUpdate
) -> LadderRung:
    result = await db.execute(
        select(LadderRung)
        .where(
            LadderRung.id == rung_id,
            LadderRung.organization_id == organization_id
        )
    )
    rung = result.scalar_one_or_none()
    if not rung:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rung not found")

    if data.avoidance_behavior_id is not None:
        rung.avoidance_behavior_id = data.avoidance_behavior_id
    if data.distress_thermometer_rating is not None:
        rung.distress_thermometer_rating = data.distress_thermometer_rating

    await db.commit()
    await db.refresh(rung)
    return rung


async def reorder_rungs(
    db: AsyncSession,
    ladder_id: uuid.UUID,
    organization_id: uuid.UUID,
    ordered_ids: list[uuid.UUID]
) -> list[LadderRung]:
    result = await db.execute(
        select(LadderRung)
        .where(
            LadderRung.ladder_id == ladder_id,
            LadderRung.organization_id == organization_id
        )
    )
    rungs = {r.id: r for r in result.scalars().all()}
    for order, rung_id in enumerate(ordered_ids):
        if rung_id in rungs:
            rungs[rung_id].rung_order = order
    await db.commit()
    return sorted(rungs.values(), key=lambda r: r.rung_order)
