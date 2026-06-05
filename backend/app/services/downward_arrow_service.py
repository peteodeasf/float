import uuid
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.downward_arrow import DownwardArrow
from app.models.treatment import TriggerSituation, TreatmentPlan
from app.schemas.downward_arrow import (
    DownwardArrowCreate,
    DownwardArrowUpdate,
)


async def _patient_id_for_situation(
    db: AsyncSession,
    situation_id: uuid.UUID,
    organization_id: uuid.UUID
) -> uuid.UUID | None:
    """Resolve the owning patient for a trigger situation (situation -> plan -> patient)."""
    result = await db.execute(
        select(TreatmentPlan.patient_id)
        .join(TriggerSituation, TriggerSituation.treatment_plan_id == TreatmentPlan.id)
        .where(
            TriggerSituation.id == situation_id,
            TriggerSituation.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


def _initial_steps(data: DownwardArrowCreate) -> list:
    if data.first_answer:
        return [{
            "question": "What will happen in this situation?",
            "response": data.first_answer
        }]
    return []


async def get_or_create_downward_arrow(
    db: AsyncSession,
    situation_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: DownwardArrowCreate
) -> DownwardArrow:
    """Get-or-create a situation-linked downward arrow, scoped by facilitated_by."""
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.trigger_situation_id == situation_id,
            DownwardArrow.organization_id == organization_id,
            DownwardArrow.facilitated_by == data.facilitated_by,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    patient_id = await _patient_id_for_situation(db, situation_id, organization_id)

    arrow = DownwardArrow(
        trigger_situation_id=situation_id,
        patient_id=patient_id,
        organization_id=organization_id,
        arrow_steps=_initial_steps(data),
        facilitated_by=data.facilitated_by,
        feared_outcome_approved=False
    )
    db.add(arrow)
    await db.commit()
    await db.refresh(arrow)
    return arrow


async def get_or_create_patient_downward_arrow(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: DownwardArrowCreate
) -> DownwardArrow:
    """Get-or-create a situation-agnostic downward arrow for a patient
    (trigger_situation_id is null, e.g. the parent DA), scoped by facilitated_by."""
    result = await db.execute(
        select(DownwardArrow)
        .where(
            DownwardArrow.patient_id == patient_id,
            DownwardArrow.organization_id == organization_id,
            DownwardArrow.facilitated_by == data.facilitated_by,
            DownwardArrow.trigger_situation_id.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    arrow = DownwardArrow(
        trigger_situation_id=None,
        patient_id=patient_id,
        organization_id=organization_id,
        arrow_steps=_initial_steps(data),
        facilitated_by=data.facilitated_by,
        feared_outcome_approved=False
    )
    db.add(arrow)
    await db.commit()
    await db.refresh(arrow)
    return arrow


async def get_downward_arrow(
    db: AsyncSession,
    situation_id: uuid.UUID,
    organization_id: uuid.UUID,
    facilitated_by: Optional[str] = None
) -> DownwardArrow | None:
    """Fetch a situation-linked downward arrow, optionally filtered by facilitated_by."""
    query = select(DownwardArrow).where(
        DownwardArrow.trigger_situation_id == situation_id,
        DownwardArrow.organization_id == organization_id,
    )
    if facilitated_by is not None:
        query = query.where(DownwardArrow.facilitated_by == facilitated_by)
    result = await db.execute(query.order_by(DownwardArrow.created_at.asc()))
    return result.scalars().first()


async def list_patient_downward_arrows(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    facilitated_by: Optional[str] = None
) -> list[DownwardArrow]:
    """List all downward arrows for a patient (situation-linked or not),
    optionally filtered by facilitated_by."""
    query = select(DownwardArrow).where(
        DownwardArrow.patient_id == patient_id,
        DownwardArrow.organization_id == organization_id,
    )
    if facilitated_by is not None:
        query = query.where(DownwardArrow.facilitated_by == facilitated_by)
    result = await db.execute(query.order_by(DownwardArrow.created_at.asc()))
    return list(result.scalars().all())


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
    if data.bip_derived is not None:
        arrow.bip_derived = data.bip_derived
    if data.facilitated_by is not None:
        arrow.facilitated_by = data.facilitated_by
    if data.is_approved is not None:
        arrow.feared_outcome_approved = data.is_approved

    arrow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(arrow)
    return arrow
