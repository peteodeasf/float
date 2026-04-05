import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.patient import PatientProfile, PractitionerProfile
from app.services.experiment_service import (
    create_experiment,
    get_experiment,
    get_experiments_for_rung,
    get_experiments_for_patient,
    save_before_state,
    save_after_state,
    skip_experiment
)
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentBeforeState,
    ExperimentAfterState,
    ExperimentResponse,
    ExperimentListResponse
)
from app.api.routers.patients import get_practitioner_context
from sqlalchemy import select

router = APIRouter(tags=["experiments"])


async def get_patient_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> tuple[User, PatientProfile]:
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise Exception("Patient profile not found")
    return current_user, patient


# Practitioner endpoints
@router.get("/patients/{patient_id}/experiments",
            response_model=list[ExperimentListResponse])
async def list_patient_experiments(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_experiments_for_patient(
        db, patient_id, practitioner.organization_id
    )


@router.get("/rungs/{rung_id}/experiments",
            response_model=list[ExperimentListResponse])
async def list_rung_experiments(
    rung_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_experiments_for_rung(
        db, rung_id, practitioner.organization_id
    )


# Patient endpoint — create experiment
@router.post("/rungs/{rung_id}/experiments",
             response_model=ExperimentResponse,
             status_code=status.HTTP_201_CREATED)
async def create_new_experiment(
    rung_id: uuid.UUID,
    data: ExperimentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise Exception("Patient profile not found")

    return await create_experiment(
        db, rung_id, patient.id, patient.organization_id, data
    )


@router.get("/experiments/{experiment_id}",
            response_model=ExperimentResponse)
async def get_single_experiment(
    experiment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Works for both practitioner and patient
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()

    if patient:
        org_id = patient.organization_id
    else:
        result = await db.execute(
            select(PractitionerProfile)
            .where(PractitionerProfile.user_id == current_user.id)
        )
        practitioner = result.scalar_one_or_none()
        if not practitioner:
            raise Exception("Profile not found")
        org_id = practitioner.organization_id

    return await get_experiment(db, experiment_id, org_id)


@router.put("/experiments/{experiment_id}/before",
            response_model=ExperimentResponse)
async def update_before_state(
    experiment_id: uuid.UUID,
    data: ExperimentBeforeState,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise Exception("Patient profile not found")

    return await save_before_state(
        db, experiment_id, patient.organization_id, data
    )


@router.put("/experiments/{experiment_id}/after",
            response_model=ExperimentResponse)
async def update_after_state(
    experiment_id: uuid.UUID,
    data: ExperimentAfterState,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise Exception("Patient profile not found")

    return await save_after_state(
        db, experiment_id, patient.organization_id, data
    )


@router.put("/experiments/{experiment_id}/skip",
            response_model=ExperimentResponse)
async def skip_single_experiment(
    experiment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise Exception("Patient profile not found")

    return await skip_experiment(
        db, experiment_id, patient.organization_id
    )
