import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.patient_service import get_patient_by_id
from app.services.treatment_plan_service import (
    create_treatment_plan,
    get_active_plan,
    update_treatment_plan
)
from app.schemas.treatment_plan import (
    TreatmentPlanCreate,
    TreatmentPlanResponse,
    TreatmentPlanUpdate
)

router = APIRouter(prefix="/patients/{patient_id}/plan", tags=["treatment-plans"])


@router.get("", response_model=TreatmentPlanResponse | None)
async def get_plan(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    return await get_active_plan(db, patient_id, practitioner.organization_id)


@router.post("", response_model=TreatmentPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    patient_id: uuid.UUID,
    data: TreatmentPlanCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    return await create_treatment_plan(
        db, patient_id, practitioner.id, practitioner.organization_id, data
    )


@router.put("/{plan_id}", response_model=TreatmentPlanResponse)
async def update_plan(
    patient_id: uuid.UUID,
    plan_id: uuid.UUID,
    data: TreatmentPlanUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    return await update_treatment_plan(db, plan_id, practitioner.organization_id, data)
