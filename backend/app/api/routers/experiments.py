import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.patient import PatientProfile, PractitionerProfile
from app.models.treatment import AvoidanceBehavior, TriggerSituation, TreatmentPlan
from app.services.experiment_service import (
    create_experiment,
    get_experiment,
    get_experiments_for_rung,
    get_experiments_for_patient,
    plan_experiment_for_behavior,
    save_before_state,
    save_after_state,
    skip_experiment
)
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentPlanCreate,
    ExperimentBeforeState,
    ExperimentAfterState,
    ExperimentResponse,
    ExperimentListResponse
)
from app.api.routers.patients import (
    get_practitioner_context,
    get_permitted_patient,
    get_permitted_behavior,
    get_permitted_rung,
    _require,
)
from app.services.patient_access_service import patient_of_record
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
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
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
    db: AsyncSession = Depends(get_db),
    # get_permitted_rung, NOT get_permitted_behavior. get_permitted_behavior takes a parameter
    # named behavior_id, which this path does not have - FastAPI turned it into a required QUERY
    # parameter, so the caller was naming the record their own access was checked against while
    # the handler read the record named by rung_id. The security review caught it in the app's own
    # OpenAPI schema. The dependency's parameter name has to match the path parameter.
    _access: None = Depends(get_permitted_rung),
):
    _, practitioner = context
    return await get_experiments_for_rung(
        db, rung_id, practitioner.organization_id
    )


# Practitioner endpoint — plan experiment for a behavior
@router.post("/behaviors/{behavior_id}/experiments",
             response_model=ExperimentResponse,
             status_code=status.HTTP_201_CREATED)
async def practitioner_plan_behavior_experiment(
    behavior_id: uuid.UUID,
    data: ExperimentPlanCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_behavior),
):
    _, practitioner = context

    # Resolve behavior → situation → plan → patient, with org check
    b_result = await db.execute(
        select(AvoidanceBehavior).where(
            AvoidanceBehavior.id == behavior_id,
            AvoidanceBehavior.organization_id == practitioner.organization_id
        )
    )
    behavior = b_result.scalar_one_or_none()
    if not behavior:
        raise HTTPException(status_code=404, detail="Behavior not found")

    ts_result = await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == behavior.trigger_situation_id)
    )
    trigger = ts_result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=404, detail="Situation not found")

    plan_result = await db.execute(
        select(TreatmentPlan).where(TreatmentPlan.id == trigger.treatment_plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan or plan.organization_id != practitioner.organization_id:
        raise HTTPException(status_code=404, detail="Treatment plan not found")

    return await plan_experiment_for_behavior(
        db, behavior_id, plan.patient_id, practitioner.organization_id, data
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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Works for both practitioner and patient
    result = await db.execute(
        select(PatientProfile)
        .where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()

    # A patient may read only their own experiment; a clinician reads any in their institution.
    caller_patient_id = patient.id if patient else None
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
        # A clinician reads an experiment only for a patient they have been granted. This is
        # checked here rather than by a dependency because the same route serves the child, who
        # has no practitioner profile at all.
        await _require(db, (current_user, practitioner),
                       await patient_of_record(db, Experiment, experiment_id), request)

    return await get_experiment(db, experiment_id, org_id, patient_id=caller_patient_id)


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
        db, experiment_id, patient.organization_id, data, patient_id=patient.id
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
        db, experiment_id, patient.organization_id, data, patient_id=patient.id
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
        db, experiment_id, patient.organization_id, patient_id=patient.id
    )
