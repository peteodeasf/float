import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.patient import PractitionerProfile, PatientProfile, ParentPatientLink
from app.models.experiment import Experiment
from app.models.message import Message
from app.schemas.patient import PatientCreate, PatientResponse, PatientListResponse
from app.services.email_service import send_teen_invitation_email
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


class InviteTeenRequest(BaseModel):
    email: EmailStr


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

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
        age=patient.age,
        gender=patient.gender,
        phone_number=patient.phone_number,
        teen_email=patient.teen_email,
        teen_invited_at=patient.teen_invited_at,
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
        age=patient.age,
        gender=patient.gender,
        phone_number=patient.phone_number,
        teen_email=patient.teen_email,
        teen_invited_at=patient.teen_invited_at,
        primary_practitioner_id=patient.primary_practitioner_id,
        created_at=patient.created_at
    )


@router.post("/{patient_id}/invite-teen")
async def invite_teen(
    patient_id: uuid.UUID,
    data: InviteTeenRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patient = await get_patient_by_id(
        db, patient_id, practitioner.organization_id
    )

    email = data.email.lower().strip()

    # Check if a user already exists with this email
    existing_user_result = await db.execute(
        select(User).where(User.email == email)
    )
    existing_user = existing_user_result.scalar_one_or_none()

    temp_password = _generate_temp_password()

    if existing_user is None:
        # Create new user with temp password and must_change_password=True
        new_user = User(
            email=email,
            password_hash=hash_password(temp_password),
            must_change_password=True,
        )
        db.add(new_user)
        await db.flush()

        # Create patient role for new user in this organization
        role = UserRole(
            user_id=new_user.id,
            organization_id=patient.organization_id,
            role="patient",
        )
        db.add(role)

        # Link patient profile to the new user
        patient.user_id = new_user.id
    else:
        # Resend invitation: reset the user's password to a fresh temp
        # and flag that they must change it on next login.
        existing_user.password_hash = hash_password(temp_password)
        existing_user.must_change_password = True

    # Save teen email + invited_at
    patient.teen_email = email
    patient.teen_invited_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(patient)

    login_url = f"{settings.BASE_URL}/teen/login"
    await send_teen_invitation_email(
        to_email=email,
        login_url=login_url,
        temporary_password=temp_password,
    )

    return {
        "success": True,
        "email": email,
        "invited_at": patient.teen_invited_at.isoformat(),
    }


# ── Patient-facing endpoints ──────────────────────────────────────────────────

@patient_router.get("/ladder")
async def get_my_ladder(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
    from app.models.ladder import ExposureLadder, LadderRung
    from app.models.downward_arrow import DownwardArrow

    plan_result = await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.patient_id == patient.id,
            TreatmentPlan.status.in_(["setup", "active"])
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return {"plan": None, "situations": []}

    triggers_result = await db.execute(
        select(TriggerSituation).where(
            TriggerSituation.treatment_plan_id == plan.id
        ).order_by(TriggerSituation.display_order)
    )
    all_triggers = triggers_result.scalars().all()
    print(f"DEBUG ladder: plan_id={plan.id}, situations count={len(all_triggers)}")

    # Return all situations that have at least one rung. is_active is included
    # per-situation so the frontend can highlight the suggested one(s).
    situations = []
    for trigger in all_triggers:
        # DA
        da_result = await db.execute(
            select(DownwardArrow).where(DownwardArrow.trigger_situation_id == trigger.id)
        )
        da = da_result.scalar_one_or_none()
        feared_outcome = da.feared_outcome if (da and da.feared_outcome_approved) else None

        # Ladder
        ladder_result = await db.execute(
            select(ExposureLadder).where(ExposureLadder.trigger_situation_id == trigger.id)
        )
        ladder = ladder_result.scalar_one_or_none()

        rungs_data = []
        if ladder:
            rungs_q = await db.execute(
                select(LadderRung).where(LadderRung.ladder_id == ladder.id)
            )
            rungs = rungs_q.scalars().all()

            for r in rungs:
                # Behavior name
                behavior_name = None
                if r.avoidance_behavior_id:
                    b_result = await db.execute(
                        select(AvoidanceBehavior).where(AvoidanceBehavior.id == r.avoidance_behavior_id)
                    )
                    behavior = b_result.scalar_one_or_none()
                    if behavior:
                        behavior_name = behavior.name

                # Experiment count and completion status
                exp_result = await db.execute(
                    select(Experiment).where(
                        Experiment.ladder_rung_id == r.id,
                        Experiment.patient_id == patient.id
                    )
                )
                experiments = exp_result.scalars().all()
                experiment_count = len(experiments)
                any_completed = any(e.status == "completed" for e in experiments)

                rungs_data.append({
                    "id": str(r.id),
                    "behavior_name": behavior_name,
                    "dt": float(r.distress_thermometer_rating) if r.distress_thermometer_rating is not None else None,
                    "completed": any_completed,
                    "experiment_count": experiment_count,
                    "rung_order": r.rung_order,
                })

            # Sort rungs by DT ascending (nulls at end)
            rungs_data.sort(key=lambda x: (x["dt"] is None, x["dt"] if x["dt"] is not None else 999))

        # Skip situations without any rungs — teen only sees situations with steps
        if not rungs_data:
            continue

        situations.append({
            "id": str(trigger.id),
            "name": trigger.name,
            "is_active": trigger.is_active,
            "feared_outcome": feared_outcome,
            "da_approved": bool(da and da.feared_outcome_approved),
            "rungs": rungs_data,
        })

    return {
        "plan": {
            "id": str(plan.id),
            "status": plan.status,
            "nickname": plan.nickname,
        },
        "situations": situations
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
