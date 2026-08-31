import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, false
from fastapi import HTTPException, status

from app.models.patient import PatientProfile, PatientAccessGrant
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
        age=data.age,
        gender=data.gender,
        phone_number=data.phone_number,
        parent_name=data.parent_name,
        parent_email=data.parent_email,
        parent_phone=data.parent_phone,
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

    # The clinician adding a patient gets access to them.
    #
    # Without this, adding a patient and then opening them returns 404 for anyone who is not an
    # institution admin — access became an explicit grant on 2026-08-28 and nothing granted it
    # here. primary_practitioner_id is set above but is deliberately NOT consulted when checking
    # access, so it does not stand in for a grant.
    await db.flush()
    db.add(PatientAccessGrant(
        patient_id=patient.id,
        practitioner_id=practitioner_id,
        organization_id=organization_id,
    ))

    await db.commit()
    await db.refresh(patient)
    return patient, user


async def get_patients_for_practitioner(
    db: AsyncSession,
    practitioner_id: uuid.UUID,
    organization_id: uuid.UUID,
    permitted_ids: list[uuid.UUID] | None = None,
) -> list[PatientProfile]:
    """The caller's roster.

    permitted_ids is the list of patients they hold a grant for; None means an institution admin,
    who sees everyone. It used to filter on primary_practitioner_id alone, which meant a clinician
    granted access to someone else's patient could open that patient but never find them in a list.
    """
    conditions = [PatientProfile.organization_id == organization_id]
    if permitted_ids is not None:
        # Grants only. primary_practitioner_id is deliberately NOT consulted here: a clinician
        # whose grant was revoked is still marked primary, and treating that as access would make
        # revoking do nothing. The migration gives every primary practitioner a grant, so nobody
        # loses a patient they already had.
        conditions.append(PatientProfile.id.in_(permitted_ids) if permitted_ids else false())
    result = await db.execute(
        select(PatientProfile)
        .where(*conditions)
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
