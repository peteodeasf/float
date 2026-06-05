import logging
import secrets
import string
import traceback
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
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse, PatientListResponse
from app.services.email_service import send_teen_invitation_email
from app.schemas.experiment import ExperimentCreate, ExperimentBeforeState, ExperimentAfterState
from app.services.patient_service import (
    create_patient,
    get_patients_for_practitioner,
    get_patient_by_id
)
from app.services.experiment_service import (
    create_experiment,
    create_experiment_for_behavior,
    save_before_state,
    save_after_state,
)


class TooHardRequest(BaseModel):
    reason: Optional[str] = None


class InviteTeenRequest(BaseModel):
    email: EmailStr


logger = logging.getLogger(__name__)


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
        anxiety_presentations=patient.anxiety_presentations,
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
        anxiety_presentations=patient.anxiety_presentations,
        phone_number=patient.phone_number,
        teen_email=patient.teen_email,
        teen_invited_at=patient.teen_invited_at,
        primary_practitioner_id=patient.primary_practitioner_id,
        created_at=patient.created_at
    )


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: uuid.UUID,
    data: PatientUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    patient = await get_patient_by_id(
        db, patient_id, practitioner.organization_id
    )
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    await db.commit()
    await db.refresh(patient)
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
        anxiety_presentations=patient.anxiety_presentations,
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


EXTRACTION_SYSTEM_PROMPT = """
You are a clinical assistant helping a CBT therapist analyze parent monitoring data for a child with anxiety.

Analyze the monitoring entries and extract the following. Return ONLY valid JSON, no markdown fences, no other text:

{
  "situations": [
    {
      "name": "situation name (concise, 3-6 words)",
      "estimated_dt": 7,
      "behaviors": [
        {
          "name": "behavior description (concise, under 10 words)",
          "type": "avoidance"
        }
      ]
    }
  ],
  "accommodation_patterns": [
    "brief description of accommodation pattern"
  ],
  "maintaining_mechanisms": "2-3 sentence clinical hypothesis about what drives and maintains this child's anxiety — written for a clinician, not the family",
  "treatment_targets": [
    "Situation name — brief rationale for prioritizing"
  ]
}

For maintaining_mechanisms, write a clinical hypothesis like: "Sarah's anxiety is maintained by a pattern of avoidance and safety behaviors that prevent disconfirmation of her feared outcomes. Parental accommodation reinforces the belief that anxiety situations are genuinely dangerous. The core feared outcome across situations appears to be social rejection and humiliation."

For treatment_targets, order by clinical priority (not just DT) and include a brief rationale.
"""


@router.post("/{patient_id}/monitoring/extract")
async def extract_monitoring_data(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    print("EXTRACTION ENDPOINT CALLED", flush=True)
    import json
    import anthropic
    from app.models.monitoring import MonitoringForm, MonitoringEntry

    _, practitioner = context

    # Fetch all monitoring entries for this patient, joined with the monitoring form
    result = await db.execute(
        select(MonitoringEntry)
        .join(MonitoringForm, MonitoringEntry.monitoring_form_id == MonitoringForm.id)
        .where(
            MonitoringForm.patient_id == patient_id,
            MonitoringForm.organization_id == practitioner.organization_id,
            MonitoringEntry.is_draft == False,  # noqa: E712
        )
        .order_by(MonitoringEntry.entry_date.asc())
    )
    entries = result.scalars().all()

    if not entries:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No monitoring entries found for this patient"
        )

    # Format the entries as a readable text block
    blocks = []
    for e in entries:
        distress = e.fear_thermometer if e.fear_thermometer is not None else "unknown"
        blocks.append(
            f"Date: {e.entry_date.isoformat()}\n"
            f"Situation: {e.situation or 'N/A'}\n"
            f"Child behavior observed: {e.child_behavior_observed or 'N/A'}\n"
            f"Parent response: {e.parent_response or 'N/A'}\n"
            f"Distress level: {distress}/10"
        )
    entries_text = "\n\n".join(blocks)

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": entries_text}],
        )
        print(f"ANTHROPIC RESPONSE: {message}", flush=True)
        raw_text = message.content[0].text
        print(f"Raw Anthropic response: {raw_text}", flush=True)
        print(f"RAW TEXT: {raw_text}", flush=True)
        # Strip any markdown fences before parsing
        clean = raw_text.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
        extraction = json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {type(e).__name__}: {str(e)}")
    except Exception as e:
        print(f"Extraction error: {type(e).__name__}: {str(e)}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI extraction failed: {type(e).__name__}: {str(e)}"
        )

    extraction.pop("suggested_presentations", None)
    extraction.pop("summary", None)
    return extraction


# ── Patient-facing endpoints ──────────────────────────────────────────────────

@patient_router.get("/ladder")
async def get_my_ladder(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
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

    situations = []
    for trigger in all_triggers:
        # Downward arrow
        da_result = await db.execute(
            select(DownwardArrow).where(DownwardArrow.trigger_situation_id == trigger.id)
        )
        da = da_result.scalar_one_or_none()
        feared_outcome = da.feared_outcome if (da and da.feared_outcome_approved) else None

        # Avoidance behaviors sorted by DT ascending (nulls last)
        behaviors_result = await db.execute(
            select(AvoidanceBehavior).where(
                AvoidanceBehavior.trigger_situation_id == trigger.id
            ).order_by(
                AvoidanceBehavior.distress_thermometer_when_refraining.is_(None),
                AvoidanceBehavior.distress_thermometer_when_refraining
            )
        )
        behaviors = behaviors_result.scalars().all()

        behaviors_data = []
        for b in behaviors:
            # Experiments for this behavior
            exp_result = await db.execute(
                select(Experiment).where(
                    Experiment.avoidance_behavior_id == b.id,
                    Experiment.patient_id == patient.id
                ).order_by(Experiment.created_at)
            )
            experiments = exp_result.scalars().all()
            completed_experiments = [e for e in experiments if e.status == "completed"]
            experiment_count = len(experiments)

            # Status logic
            latest_dt_actual = None
            if completed_experiments:
                latest = completed_experiments[-1]
                latest_dt_actual = float(latest.distress_thermometer_actual) if latest.distress_thermometer_actual is not None else None

            if len(completed_experiments) >= 2 and latest_dt_actual is not None and latest_dt_actual <= 2:
                b_status = "mastered"
            elif len(completed_experiments) >= 1:
                b_status = "in_progress"
            else:
                b_status = "not_started"

            experiments_data = []
            for e in experiments:
                experiments_data.append({
                    "id": str(e.id),
                    "status": e.status,
                    "scheduled_date": e.scheduled_date.isoformat() if e.scheduled_date else None,
                    "dt_actual": float(e.distress_thermometer_actual) if e.distress_thermometer_actual is not None else None,
                    "bip_before": float(e.bip_before) if e.bip_before is not None else None,
                    "bip_after": float(e.bip_after) if e.bip_after is not None else None,
                    "feared_outcome_occurred": e.feared_outcome_occurred,
                })

            behaviors_data.append({
                "id": str(b.id),
                "name": b.name,
                "behavior_type": b.behavior_type,
                "dt": float(b.distress_thermometer_when_refraining) if b.distress_thermometer_when_refraining is not None else None,
                "experiment_count": experiment_count,
                "latest_dt_actual": latest_dt_actual,
                "status": b_status,
                "experiments": experiments_data,
            })

        # Skip situations without any behaviors
        if not behaviors_data:
            continue

        situations.append({
            "id": str(trigger.id),
            "name": trigger.name,
            "is_active": trigger.is_active,
            "feared_outcome": feared_outcome,
            "da_approved": bool(da and da.feared_outcome_approved),
            "behaviors": behaviors_data,
        })

    return {
        "plan": {
            "id": str(plan.id),
            "status": plan.status,
            "nickname": plan.nickname,
        },
        "situations": situations
    }


@patient_router.get("/behaviors/{behavior_id}")
async def get_behavior_detail(
    behavior_id: uuid.UUID,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
    from app.models.downward_arrow import DownwardArrow

    # Find the behavior
    b_result = await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.id == behavior_id)
    )
    behavior = b_result.scalar_one_or_none()
    if not behavior:
        raise HTTPException(status_code=404, detail="Behavior not found")

    # Verify it belongs to the patient's plan
    ts_result = await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == behavior.trigger_situation_id)
    )
    trigger = ts_result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=404, detail="Situation not found")

    plan_result = await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.id == trigger.treatment_plan_id,
            TreatmentPlan.patient_id == patient.id
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Not authorized")

    # Downward arrow
    da_result = await db.execute(
        select(DownwardArrow).where(DownwardArrow.trigger_situation_id == trigger.id)
    )
    da = da_result.scalar_one_or_none()
    feared_outcome = da.feared_outcome if (da and da.feared_outcome_approved) else None

    return {
        "id": str(behavior.id),
        "name": behavior.name,
        "behavior_type": behavior.behavior_type,
        "dt": float(behavior.distress_thermometer_when_refraining) if behavior.distress_thermometer_when_refraining is not None else None,
        "situation": {
            "id": str(trigger.id),
            "name": trigger.name,
            "feared_outcome": feared_outcome,
            "da_approved": bool(da and da.feared_outcome_approved),
        }
    }


@patient_router.post("/behaviors/{behavior_id}/experiments", status_code=status.HTTP_201_CREATED)
async def patient_create_behavior_experiment(
    behavior_id: uuid.UUID,
    data: ExperimentCreate,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    _, patient = context
    from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior

    # Validate behavior belongs to patient's plan
    b_result = await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.id == behavior_id)
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
        select(TreatmentPlan).where(
            TreatmentPlan.id == trigger.treatment_plan_id,
            TreatmentPlan.patient_id == patient.id
        )
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Not authorized")

    experiment = await create_experiment_for_behavior(
        db, behavior_id, patient.id, patient.organization_id, data
    )
    return experiment


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
    user, patient = context
    experiment = await save_after_state(
        db, experiment_id, patient.organization_id, data
    )

    if experiment.status == "completed":
        from app.models.treatment import AvoidanceBehavior

        practitioner = None
        if patient.primary_practitioner_id:
            pr_result = await db.execute(
                select(PractitionerProfile).where(
                    PractitionerProfile.id == patient.primary_practitioner_id,
                    PractitionerProfile.organization_id == patient.organization_id,
                )
            )
            practitioner = pr_result.scalar_one_or_none()
        if practitioner is None:
            pr_result = await db.execute(
                select(PractitionerProfile).where(
                    PractitionerProfile.organization_id == patient.organization_id
                )
            )
            practitioner = pr_result.scalars().first()

        if practitioner is not None:
            behavior_name = None
            if experiment.avoidance_behavior_id:
                b_result = await db.execute(
                    select(AvoidanceBehavior).where(
                        AvoidanceBehavior.id == experiment.avoidance_behavior_id
                    )
                )
                behavior = b_result.scalar_one_or_none()
                if behavior:
                    behavior_name = behavior.name

            date_str = (
                experiment.completed_date.strftime("%Y-%m-%d")
                if experiment.completed_date else "unknown date"
            )
            bip_before = f"{int(experiment.bip_before)}" if experiment.bip_before is not None else "?"
            bip_after = f"{int(experiment.bip_after)}" if experiment.bip_after is not None else "?"
            dt_actual = (
                f"{experiment.distress_thermometer_actual:g}"
                if experiment.distress_thermometer_actual is not None else "?"
            )
            fo_str = (
                "Yes" if experiment.feared_outcome_occurred is True
                else "No" if experiment.feared_outcome_occurred is False
                else "Unknown"
            )
            content = (
                f"Experiment completed: {behavior_name or 'experiment'} on {date_str}. "
                f"BIP: {bip_before}% → {bip_after}%. "
                f"Fear level: {dt_actual}/10. "
                f"Feared outcome occurred: {fo_str}."
            )

            message = Message(
                organization_id=patient.organization_id,
                sender_user_id=user.id,
                recipient_user_id=practitioner.user_id,
                patient_id=patient.id,
                content=content,
                message_type="experiment_completed",
                sender_type="system",
            )
            db.add(message)
            await db.commit()

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


@patient_router.get("/messages")
async def get_my_messages(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    current_user, _ = context
    from sqlalchemy import or_
    result = await db.execute(
        select(Message)
        .where(
            or_(
                Message.recipient_user_id == current_user.id,
                Message.sender_user_id == current_user.id,
            )
        )
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "content": m.content,
            "message_type": m.message_type,
            "sender_user_id": str(m.sender_user_id),
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "read_at": m.read_at.isoformat() if m.read_at else None,
        }
        for m in messages
    ]


class PatientMessageCreate(BaseModel):
    content: str
    message_type: str = "general"


@patient_router.post("/messages", status_code=status.HTTP_201_CREATED)
async def send_my_message(
    data: PatientMessageCreate,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    current_user, patient = context
    if not patient.primary_practitioner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No primary practitioner assigned",
        )
    practitioner_result = await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.id == patient.primary_practitioner_id
        )
    )
    practitioner = practitioner_result.scalar_one_or_none()
    if not practitioner:
        raise HTTPException(status_code=404, detail="Primary practitioner not found")

    message = Message(
        organization_id=patient.organization_id,
        sender_user_id=current_user.id,
        recipient_user_id=practitioner.user_id,
        patient_id=patient.id,
        content=data.content,
        message_type=data.message_type,
        sender_type="patient",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return {
        "id": str(message.id),
        "content": message.content,
        "message_type": message.message_type,
        "sender_user_id": str(message.sender_user_id),
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "read_at": message.read_at.isoformat() if message.read_at else None,
    }


@patient_router.put("/messages/{message_id}/read")
async def mark_my_message_read(
    message_id: uuid.UUID,
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db)
):
    current_user, _ = context
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.recipient_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if message.read_at is None:
        message.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"success": True}
