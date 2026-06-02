import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.formulation import ClinicalFormulation
from app.api.routers.patients import get_practitioner_context


# --- Schemas ---

class FormulationCreate(BaseModel):
    maintaining_mechanisms: Optional[str] = None
    accommodation_patterns: Optional[List[str]] = None
    treatment_targets: Optional[List[str]] = None
    ai_suggested: bool = False


class FormulationUpdate(BaseModel):
    maintaining_mechanisms: Optional[str] = None
    accommodation_patterns: Optional[List[str]] = None
    treatment_targets: Optional[List[str]] = None
    ai_suggested: Optional[bool] = None


class FormulationResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    organization_id: uuid.UUID
    practitioner_id: uuid.UUID
    maintaining_mechanisms: Optional[str] = None
    accommodation_patterns: Optional[List[str]] = None
    treatment_targets: Optional[List[str]] = None
    ai_suggested: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Router ---

router = APIRouter(tags=["formulation"])


@router.get(
    "/patients/{patient_id}/formulation",
    response_model=FormulationResponse
)
async def get_formulation(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == patient_id,
            ClinicalFormulation.organization_id == practitioner.organization_id
        )
    )
    formulation = result.scalar_one_or_none()
    if not formulation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Formulation not found"
        )
    return formulation


@router.post(
    "/patients/{patient_id}/formulation",
    response_model=FormulationResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_formulation(
    patient_id: uuid.UUID,
    data: FormulationCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    formulation = ClinicalFormulation(
        patient_id=patient_id,
        organization_id=practitioner.organization_id,
        practitioner_id=practitioner.id,
        maintaining_mechanisms=data.maintaining_mechanisms,
        accommodation_patterns=data.accommodation_patterns,
        treatment_targets=data.treatment_targets,
        ai_suggested=data.ai_suggested,
    )
    db.add(formulation)
    await db.commit()
    await db.refresh(formulation)
    return formulation


@router.put(
    "/patients/{patient_id}/formulation",
    response_model=FormulationResponse
)
async def update_formulation(
    patient_id: uuid.UUID,
    data: FormulationUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == patient_id,
            ClinicalFormulation.organization_id == practitioner.organization_id
        )
    )
    formulation = result.scalar_one_or_none()
    if not formulation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Formulation not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(formulation, field, value)

    await db.commit()
    await db.refresh(formulation)
    return formulation
