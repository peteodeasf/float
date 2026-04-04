import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.patient import PractitionerProfile
from app.schemas.patient import PatientCreate, PatientResponse, PatientListResponse
from app.services.patient_service import (
    create_patient,
    get_patients_for_practitioner,
    get_patient_by_id
)

router = APIRouter(prefix="/patients", tags=["patients"])


async def get_practitioner_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> tuple[User, PractitionerProfile]:
    result = await db.execute(
        select(PractitionerProfile)
        .where(PractitionerProfile.user_id == current_user.id)
    )
    practitioner = result.scalar_one_or_none()
    if not practitioner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Practitioner profile not found"
        )
    return current_user, practitioner


@router.get("", response_model=list[PatientListResponse])
async def list_patients(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patients = await get_patients_for_practitioner(
        db, practitioner.id, practitioner.organization_id
    )
    
    # Join with user emails
    result = []
    for patient in patients:
        user_result = await db.execute(
            select(User).where(User.id == patient.user_id)
        )
        user = user_result.scalar_one()
        result.append(PatientListResponse(
            id=patient.id,
            name=patient.name,
            email=user.email,
            created_at=patient.created_at
        ))
    return result


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_new_patient(
    data: PatientCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patient, user = await create_patient(
        db, data, practitioner.id, practitioner.organization_id
    )
    return PatientResponse(
        id=patient.id,
        name=patient.name,
        email=user.email,
        date_of_birth=patient.date_of_birth,
        primary_practitioner_id=patient.primary_practitioner_id,
        created_at=patient.created_at
    )


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patient = await get_patient_by_id(
        db, patient_id, practitioner.organization_id
    )
    user_result = await db.execute(
        select(User).where(User.id == patient.user_id)
    )
    user = user_result.scalar_one()
    return PatientResponse(
        id=patient.id,
        name=patient.name,
        email=user.email,
        date_of_birth=patient.date_of_birth,
        primary_practitioner_id=patient.primary_practitioner_id,
        created_at=patient.created_at
    )
