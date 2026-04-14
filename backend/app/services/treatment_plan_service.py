import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.treatment import TreatmentPlan
from app.schemas.treatment_plan import TreatmentPlanCreate, TreatmentPlanUpdate


async def create_treatment_plan(
    db: AsyncSession,
    patient_id: uuid.UUID,
    practitioner_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TreatmentPlanCreate
) -> TreatmentPlan:
    plan = TreatmentPlan(
        patient_id=patient_id,
        practitioner_id=practitioner_id,
        organization_id=organization_id,
        clinical_track=data.clinical_track,
        parent_visibility_level=data.parent_visibility_level,
        status="setup",
        nickname=data.nickname
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_active_plan(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> TreatmentPlan | None:
    result = await db.execute(
        select(TreatmentPlan)
        .where(
            TreatmentPlan.patient_id == patient_id,
            TreatmentPlan.organization_id == organization_id,
            TreatmentPlan.status != "complete"
        )
        .order_by(TreatmentPlan.created_at.desc())
    )
    return result.scalar_one_or_none()


async def update_treatment_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TreatmentPlanUpdate
) -> TreatmentPlan:
    result = await db.execute(
        select(TreatmentPlan)
        .where(
            TreatmentPlan.id == plan_id,
            TreatmentPlan.organization_id == organization_id
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Treatment plan not found"
        )
    if data.clinical_track is not None:
        plan.clinical_track = data.clinical_track
    if data.parent_visibility_level is not None:
        plan.parent_visibility_level = data.parent_visibility_level
    if data.status is not None:
        plan.status = data.status
    if data.nickname is not None:
        plan.nickname = data.nickname
    await db.commit()
    await db.refresh(plan)
    return plan
