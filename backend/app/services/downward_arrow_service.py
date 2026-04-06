import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.downward_arrow import DownwardArrow
from app.schemas.downward_arrow import (
    DownwardArrowCreate,
    DownwardArrowUpdate,
    DownwardArrowApprove
)


async def get_or_create_downward_arrow(
    db: AsyncSession,
    rung_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: DownwardArrowCreate
) -> DownwardArrow:
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.ladder_rung_id == rung_id,
            DownwardArrow.organization_id == organization_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    arrow = DownwardArrow(
        ladder_rung_id=rung_id,
        organization_id=organization_id,
        arrow_steps=[],
        facilitated_by=data.facilitated_by,
        feared_outcome_approved=False
    )
    db.add(arrow)
    await db.commit()
    await db.refresh(arrow)
    return arrow


async def get_downward_arrow(
    db: AsyncSession,
    rung_id: uuid.UUID,
    organization_id: uuid.UUID
) -> DownwardArrow | None:
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.ladder_rung_id == rung_id,
            DownwardArrow.organization_id == organization_id
        )
    )
    return result.scalar_one_or_none()


async def update_downward_arrow(
    db: AsyncSession,
    arrow_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: DownwardArrowUpdate
) -> DownwardArrow:
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.id == arrow_id,
            DownwardArrow.organization_id == organization_id
        )
    )
    arrow = result.scalar_one_or_none()
    if not arrow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Downward arrow not found"
        )

    if data.arrow_steps is not None:
        arrow.arrow_steps = [s.model_dump() for s in data.arrow_steps]
    if data.feared_outcome is not None:
        arrow.feared_outcome = data.feared_outcome
        arrow.feared_outcome_approved = False
    if data.bip_derived is not None:
        arrow.bip_derived = data.bip_derived
    if data.facilitated_by is not None:
        arrow.facilitated_by = data.facilitated_by

    arrow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(arrow)
    return arrow


async def approve_downward_arrow(
    db: AsyncSession,
    arrow_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: DownwardArrowApprove
) -> DownwardArrow:
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.id == arrow_id,
            DownwardArrow.organization_id == organization_id
        )
    )
    arrow = result.scalar_one_or_none()
    if not arrow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Downward arrow not found"
        )

    arrow.feared_outcome = data.feared_outcome
    arrow.bip_derived = data.bip_derived
    arrow.feared_outcome_approved = True
    arrow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(arrow)
    return arrow
