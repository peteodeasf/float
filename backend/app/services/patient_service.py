import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.patient import PatientProfile
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.schemas.patient import PatientCreate


async def create_patient(
    db: AsyncSession,
    data: PatientCreate,
    practitioner_id: uuid.UUID,
    organization_id: uuid.UUID
) -> tuple[PatientProfile, User]:
    # Check email not already in use
    existing = await db.execute(
        select(User).where(User.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user account for patient
    user = User(
        email=data.email,
        password_hash=hash_password(uuid.uuid4().hex)  # temp password
    )
    db.add(user)
    await db.flush()

    # Create patient profile
    patient = PatientProfile(
        user_id=user.id,
        organization_id=organization_id,
        name=data.name,
        date_of_birth=data.date_of_birth,
        phone_number=data.phone_number,
        primary_practitioner_id=practitioner_id
    )
    db.add(patient)

    # Create patient role
    role = UserRole(
        user_id=user.id,
        organization_id=organization_id,
        role="patient"
    )
    db.add(role)

    await db.commit()
    await db.refresh(patient)
    return patient, user


async def get_patients_for_practitioner(
    db: AsyncSession,
    practitioner_id: uuid.UUID,
    organization_id: uuid.UUID
) -> list[PatientProfile]:
    result = await db.execute(
        select(PatientProfile)
        .where(
            PatientProfile.primary_practitioner_id == practitioner_id,
            PatientProfile.organization_id == organization_id
        )
        .order_by(PatientProfile.created_at.desc())
    )
    return result.scalars().all()


async def get_patient_by_id(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> PatientProfile:
    result = await db.execute(
        select(PatientProfile)
        .where(
            PatientProfile.id == patient_id,
            PatientProfile.organization_id == organization_id
        )
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    return patient
