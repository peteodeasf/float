import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.patient import PractitionerProfile, PatientProfile, ParentPatientLink
from app.models.experiment import Experiment
from app.models.message import Message
from app.schemas.patient import PatientCreate, PatientResponse, PatientListResponse
from app.schemas.experiment import ExperimentCreate, ExperimentBeforeState, ExperimentAfterState
from app.services.patient_service import (
    create_patient,
    get_patients_for_practitioner,
    get_patient_by_id
)
from app.services.experiment_service import (
    create_experiment,
    save_before_state,
    save_after_state,
)


class TooHardRequest(BaseModel):
    reason: Optional[str] = None

router = APIRouter(prefix="/patients", tags=["patients"])
patient_router = APIRouter(prefix="/patient", tags=["patient"])


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


async def get_patient_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> tuple[User, PatientProfile]:
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient profile not found"
        )
    return current_user, patient


@router.get("", response_model=list[PatientListResponse])
async def list_patients(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patients = await get_patients_for_practitioner(
        db, practitioner.id, practitioner.organization_id
    )
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
            phone_number=patient.phone_number,
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
        user_id=patient.user_id,
        name=patient.name,
        email=user.email,
        date_of_birth=patient.date_of_birth,
        phone_number=patient.phone_number,
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
        user_id=patient.user_id,
        name=patient.name,
        email=user.email,
        date_of_birth=patient.date_of_birth,
        phone_number=patient.phone_number,
        primary_practitioner_id=patient.primary_practitioner_id,
        created_at=patient.created_at
    )


# ── Patient-facing endpoints ──────────────────────────────────────────────────

@patient_router.get("/plan")
async def get_my_plan(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan
    result = await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.patient_id == patient.id,
            TreatmentPlan.status.in_(["setup", "active"])
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="No active plan found")
    return plan


@patient_router.get("/plan/triggers")
async def get_my_triggers(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan, TriggerSituation
    plan_result = await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.patient_id == patient.id,
            TreatmentPlan.status.in_(["setup", "active"])
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return []
    result = await db.execute(
        select(TriggerSituation).where(
            TriggerSituation.treatment_plan_id == plan.id
        ).order_by(TriggerSituation.display_order)
    )
    return result.scalars().all()


@patient_router.get("/plan/triggers/{trigger_id}/ladder")
async def get_my_ladder(
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    from app.models.ladder import ExposureLadder, LadderRung
    result = await db.execute(
        select(ExposureLadder).where(
            ExposureLadder.trigger_situation_id == trigger_id
        )
    )
    ladder = result.scalar_one_or_none()
    if not ladder:
        raise HTTPException(status_code=404, detail="Ladder not found")
    rungs_result = await db.execute(
        select(LadderRung).where(
            LadderRung.ladder_id == ladder.id
        ).order_by(LadderRung.rung_order)
    )
    rungs = rungs_result.scalars().all()
    return {
        "id": str(ladder.id),
        "trigger_situation_id": str(ladder.trigger_situation_id),
        "status": ladder.status,
        "review_status": ladder.review_status,
        "rungs": [
            {
                "id": str(r.id),
                "ladder_id": str(r.ladder_id),
                "avoidance_behavior_id": str(r.avoidance_behavior_id) if r.avoidance_behavior_id else None,
                "distress_thermometer_rating": float(r.distress_thermometer_rating) if r.distress_thermometer_rating else None,
                "rung_order": r.rung_order,
                "status": r.status
            }
            for r in rungs
        ]
    }


@patient_router.post("/experiments/{experiment_id}/commit")
async def commit_experiment(
    experiment_id: uuid.UUID,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    result = await db.execute(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.patient_id == patient.id
        )
    )
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    experiment.status = "committed"
    experiment.committed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(experiment)
    return {"status": experiment.status, "committed_at": experiment.committed_at.isoformat()}


@patient_router.post("/experiments/{experiment_id}/too-hard")
async def too_hard_experiment(
    experiment_id: uuid.UUID,
    body: TooHardRequest,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    user, patient = context
    result = await db.execute(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.patient_id == patient.id
        )
    )
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    experiment.status = "too_hard"
    experiment.too_hard_at = datetime.now(timezone.utc)

    if body.reason:
        practitioner_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.id == patient.primary_practitioner_id
            )
        )
        practitioner = practitioner_result.scalar_one_or_none()
        if practitioner:
            message = Message(
                organization_id=patient.organization_id,
                sender_user_id=user.id,
                recipient_user_id=practitioner.user_id,
                patient_id=patient.id,
                content=f"I found this experiment too hard: {body.reason}. Can you suggest a change?",
                message_type="too_hard",
            )
            db.add(message)

    await db.commit()
    await db.refresh(experiment)
    return {"status": experiment.status, "too_hard_at": experiment.too_hard_at.isoformat()}


@patient_router.get("/experiments/pending")
async def get_pending_experiments(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    result = await db.execute(
        select(Experiment).where(
            Experiment.patient_id == patient.id,
            Experiment.status.in_(["planned", "committed"])
        ).order_by(Experiment.created_at.desc())
    )
    return result.scalars().all()


@patient_router.post("/rungs/{rung_id}/experiments", status_code=status.HTTP_201_CREATED)
async def patient_create_experiment(
    rung_id: uuid.UUID,
    data: ExperimentCreate,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    experiment = await create_experiment(
        db, rung_id, patient.id, patient.organization_id, data
    )
    return experiment


@patient_router.put("/experiments/{experiment_id}/before")
async def patient_save_before_state(
    experiment_id: uuid.UUID,
    data: ExperimentBeforeState,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    experiment = await save_before_state(
        db, experiment_id, patient.organization_id, data
    )
    return experiment


@patient_router.put("/experiments/{experiment_id}/after")
async def patient_save_after_state(
    experiment_id: uuid.UUID,
    data: ExperimentAfterState,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    experiment = await save_after_state(
        db, experiment_id, patient.organization_id, data
    )
    return experiment


@patient_router.get("/action-plans")
async def get_my_action_plans(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.action_plan import ActionPlan
    result = await db.execute(
        select(ActionPlan).where(
            ActionPlan.patient_id == patient.id,
            ActionPlan.visible_to_patient == True
        ).order_by(ActionPlan.session_number.desc())
    )
    return result.scalars().all()
