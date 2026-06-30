import logging
import secrets
import string
import traceback
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.patient import PractitionerProfile, PatientProfile, ParentPatientLink
from app.models.experiment import Experiment
from app.models.message import Message
from app.models.session_note import SessionNote
from app.models.downward_arrow import DownwardArrow
from app.models.monitoring import MonitoringForm, MonitoringEntry
from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
from app.models.formulation import ClinicalFormulation
from app.models.checklist import ConsultationChecklist
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


async def _compute_patient_list_metrics(db: AsyncSession, patient: PatientProfile) -> dict:
    """Compute treatment-journey progress and needs-attention metrics for the patient list."""
    pid = patient.id
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = now - timedelta(days=7)

    # --- Monitoring form / entries ---
    forms = (await db.execute(
        select(MonitoringForm.id, MonitoringForm.sent_at).where(MonitoringForm.patient_id == pid)
    )).all()
    form_ids = [f.id for f in forms]
    monitoring_form_sent = any(f.sent_at is not None for f in forms)

    monitoring_entries_count = 0
    last_entry_at = None
    if form_ids:
        monitoring_entries_count = (await db.execute(
            select(func.count()).select_from(MonitoringEntry).where(
                MonitoringEntry.monitoring_form_id.in_(form_ids),
                MonitoringEntry.is_draft.is_(False),
            )
        )).scalar_one()
        last_entry_at = (await db.execute(
            select(func.max(MonitoringEntry.created_at)).where(
                MonitoringEntry.monitoring_form_id.in_(form_ids)
            )
        )).scalar_one()

    # --- Treatment plan / trigger situations / behaviors ---
    plan = (await db.execute(
        select(TreatmentPlan).where(TreatmentPlan.patient_id == pid)
        .order_by(TreatmentPlan.created_at.desc())
    )).scalars().first()
    plan_status = plan.status if plan else None

    situation_count = 0
    has_active_situation_with_behaviors = False
    if plan:
        situation_count = (await db.execute(
            select(func.count()).select_from(TriggerSituation).where(
                TriggerSituation.treatment_plan_id == plan.id,
                TriggerSituation.is_placeholder.is_(False),
            )
        )).scalar_one()
        has_active_situation_with_behaviors = (await db.execute(
            select(TriggerSituation.id)
            .join(AvoidanceBehavior, AvoidanceBehavior.trigger_situation_id == TriggerSituation.id)
            .where(
                TriggerSituation.treatment_plan_id == plan.id,
                TriggerSituation.is_active.is_(True),
                TriggerSituation.is_placeholder.is_(False),
            )
            .limit(1)
        )).first() is not None

    # --- Session notes ---
    note_types = {row[0] for row in (await db.execute(
        select(SessionNote.session_type).where(SessionNote.patient_id == pid).distinct()
    )).all()}
    has_consultation_1_note = 'consultation_1' in note_types
    has_consultation_2_note = 'consultation_2' in note_types
    has_weekly_note = 'weekly_session' in note_types

    # --- Downward arrows ---
    da_facilitators = {row[0] for row in (await db.execute(
        select(DownwardArrow.facilitated_by).where(DownwardArrow.patient_id == pid).distinct()
    )).all()}
    has_parent_da = 'parent' in da_facilitators
    has_patient_da = 'practitioner' in da_facilitators

    # --- Experiments ---
    completed_experiment_count = (await db.execute(
        select(func.count()).select_from(Experiment).where(
            Experiment.patient_id == pid, Experiment.status == 'completed'
        )
    )).scalar_one()
    overdue_experiment_count = (await db.execute(
        select(func.count()).select_from(Experiment).where(
            Experiment.patient_id == pid,
            Experiment.status == 'committed',
            Experiment.scheduled_date.is_not(None),
            Experiment.scheduled_date < today_start,
        )
    )).scalar_one()
    recent_activity_exists = (await db.execute(
        select(Experiment.id).where(
            Experiment.patient_id == pid,
            or_(
                Experiment.created_at >= seven_days_ago,
                Experiment.committed_at >= seven_days_ago,
            ),
        ).limit(1)
    )).first() is not None
    active_plan_with_no_recent_activity = (plan_status == 'active') and not recent_activity_exists

    # --- Last activity (most recent of several sources, falling back to created_at) ---
    last_exp_at = (await db.execute(
        select(func.max(Experiment.created_at)).where(Experiment.patient_id == pid)
    )).scalar_one()
    last_note_at = (await db.execute(
        select(func.max(SessionNote.created_at)).where(SessionNote.patient_id == pid)
    )).scalar_one()
    last_msg_at = (await db.execute(
        select(func.max(Message.created_at)).where(Message.patient_id == pid)
    )).scalar_one()
    candidates = [c for c in [last_exp_at, last_note_at, last_msg_at, last_entry_at, patient.created_at] if c is not None]
    last_activity_at = max(candidates) if candidates else patient.created_at

    # --- Consultation checklist state ---
    checklist_checked_items = (await db.execute(
        select(ConsultationChecklist.checked_items).where(ConsultationChecklist.patient_id == pid)
    )).scalars().first() or {}

    return {
        'last_activity_at': last_activity_at,
        'has_monitoring_form': monitoring_form_sent,
        'situation_count': situation_count,
        'has_consultation_1_note': has_consultation_1_note,
        'has_parent_da': has_parent_da,
        'has_consultation_2_note': has_consultation_2_note,
        'has_patient_da': has_patient_da,
        'has_active_situation_with_behaviors': has_active_situation_with_behaviors,
        'plan_status': plan_status,
        'teen_invited': patient.teen_invited_at is not None,
        'completed_experiment_count': completed_experiment_count,
        'has_weekly_note': has_weekly_note,
        'overdue_experiment_count': overdue_experiment_count,
        'active_plan_with_no_recent_activity': active_plan_with_no_recent_activity,
        'monitoring_entries_count': monitoring_entries_count,
        'monitoring_form_sent': monitoring_form_sent,
        'checklist_checked_items': checklist_checked_items,
    }


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
        metrics = await _compute_patient_list_metrics(db, patient)
        result.append(PatientListResponse(
            id=patient.id,
            name=patient.name,
            email=user.email,
            phone_number=patient.phone_number,
            created_at=patient.created_at,
            **metrics,
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
        parent_name=patient.parent_name,
        parent_email=patient.parent_email,
        parent_phone=patient.parent_phone,
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
        parent_name=patient.parent_name,
        parent_email=patient.parent_email,
        parent_phone=patient.parent_phone,
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
        parent_name=patient.parent_name,
        parent_email=patient.parent_email,
        parent_phone=patient.parent_phone,
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

Analyze the monitoring entries and extract trigger situations with their associated avoidance and safety behaviors.

CLASSIFICATION RULES — apply these precisely:
- "avoidance" = the child does not enter the situation, leaves it, or escapes it entirely. Examples: not raising hand, avoiding kids they don't know, going to the library instead of lunch, pretending not to see someone, refusing to attend, staying home.
- "safety" = the child stays in the situation but does something to reduce perceived threat or attention. Examples: wearing headphones to appear busy, speaking in a quiet voice, hiding behind hair, sitting at the back, rushing through, bringing a comfort object, staying close to a parent.
- If you cannot confidently classify a behavior as avoidance or safety, use "behavior" — do not guess.

DT RATINGS:
- Use the parent's fear thermometer rating from the monitoring entry the behavior was observed in. Do not estimate or invent ratings.
- If the same behavior appears in multiple entries with different ratings, use the most recent entry's rating.

Return ONLY valid JSON, no markdown fences, no other text:

{
  "situations": [
    {
      "name": "situation name (concise, mirroring the parent's language)",
      "behaviors": [
        {
          "name": "behavior description (concise, in the child's voice where possible)",
          "type": "avoidance",
          "dt": 7
        }
      ]
    }
  ],
  "accommodation_patterns": [
    "brief description of accommodation pattern"
  ]
}

The "type" field must be exactly one of: "avoidance", "safety", "behavior".
The "dt" field is the parent's fear thermometer rating from the relevant monitoring entry.
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

    # Record that monitoring data was extracted for this patient's active plan (if any)
    plan_result = await db.execute(
        select(TreatmentPlan)
        .where(
            TreatmentPlan.patient_id == patient_id,
            TreatmentPlan.organization_id == practitioner.organization_id,
            TreatmentPlan.status != "complete",
        )
        .order_by(TreatmentPlan.created_at.desc())
    )
    plan = plan_result.scalar_one_or_none()
    if plan is not None:
        plan.last_extracted_at = datetime.now(timezone.utc)
        await db.commit()

    return extraction


PRELIMINARY_REPORT_SYSTEM_PROMPT = """
You are a senior CBT clinician analyzing a parent's monitoring log for a child with anxiety, ahead of the first consultation. Produce a concise PRELIMINARY REPORT that mirrors how clinicians organize a case.

The monitoring entries are raw, one-observation-per-row parent narratives. Your job is to synthesize them into a clinical picture:

1. SITUATIONS — cluster the raw observations into a small set of themed trigger situations (typically 2–5). Name each in clinical-but-readable language. Assign each situation a "fear_thermometer" score = the HIGHEST fear-thermometer rating observed across the entries belonging to that theme (0–10). Build a fuller clinical picture: where the pattern clearly implies related triggers the parent didn't log explicitly, you may add them (this is a clinician's synthesis, not a literal transcription).

2. PARENTAL_RESPONSES — how the parents respond across situations (reassurance, physical proximity, seeking medical attention, allowing avoidance, accommodation, getting angry, etc.). One clause per distinct response pattern.

3. SAFETY_BEHAVIORS — the child's safety behaviors, avoidance behaviors, and rituals. Group by situation where it reads naturally (e.g. "Mistakes in sports: crying, sulking..."). If the presentation is OCD-style (checking, ordering/arranging, contamination/washing, sniffing), set "safety_section_label" to "Rituals"; otherwise set it to "Safety & avoidance behaviors".

4. TREATMENT_TARGETS — the trigger situations to work on, listed from LOWEST to HIGHEST fear thermometer (start with the easiest, for exposure laddering).

Return ONLY valid JSON, no markdown fences, no other text, in exactly this shape:

{
  "situations": [{ "name": "string", "fear_thermometer": 8 }],
  "parental_responses": ["string"],
  "safety_behaviors": ["string"],
  "safety_section_label": "Safety & avoidance behaviors",
  "treatment_targets": ["string"]
}

Below are three calibration examples showing the depth, structure, and clinical voice expected. Match this level of synthesis.

EXAMPLE — Patrick (health-anxiety / perfectionism presentation):
{
  "situations": [
    { "name": "Imperfect performance by other team members", "fear_thermometer": 6 },
    { "name": "Health problems (minor injury, concussion)", "fear_thermometer": 7 },
    { "name": "Imperfect performance in sports (pitching a ball rather than a strike, getting tagged out, being struck out)", "fear_thermometer": 8 },
    { "name": "Experiencing physiological sensations (racing heart, shortness of breath, chest pressure, dizziness)", "fear_thermometer": 10 }
  ],
  "parental_responses": [
    "Provide excessive reassurance and physical proximity (hand-holding); seek medical attention immediately.",
    "Excessive reassurance, physical proximity, arrangements for immediate medical assessment.",
    "Reassurance that everyone makes mistakes; allow Patrick to avoid participation.",
    "Reassure and ignore Patrick's behaviors toward others; apologize to the coach and ask the coach to go easy on him; intervene with teacher or coach to change their behavior toward him."
  ],
  "safety_behaviors": [
    "Physical sensations and health concerns: avoidance and escape behaviors; reassurance seeking from parents, especially mother; excessive requests for medical treatment/assessment; requests for a parent to be physically by his side.",
    "Mistakes in sports: crying, angry physical gestures toward self, sulking.",
    "Observing teammates make errors: yelling at teammates, bossing teammates around (acting like the coach) to prevent more errors."
  ],
  "safety_section_label": "Safety & avoidance behaviors",
  "treatment_targets": [
    "Imperfect performance by other team members",
    "Health problems (minor injury, concussion)",
    "Imperfect performance in sports",
    "Experiencing physiological sensations (racing heart, shortness of breath, chest pressure, dizziness)"
  ]
}

EXAMPLE — Maya (math/performance anxiety):
{
  "situations": [
    { "name": "Bedtime / sleeping alone", "fear_thermometer": 6 },
    { "name": "Math problems (homework, class, tutoring)", "fear_thermometer": 9 }
  ],
  "parental_responses": [
    "Allow avoidance: let Maya attempt only the easiest math problems; allow her to sleep in the parents' room; reassure her that she can do the math.",
    "School: arranged removal from math class; allow avoidance of any math when Maya is distressed; reassurance that she can do the work."
  ],
  "safety_behaviors": [
    "Avoidance / refusal of math tasks.",
    "Asks parents to sit with her when she attempts math."
  ],
  "safety_section_label": "Safety & avoidance behaviors",
  "treatment_targets": [
    "Bedtime / sleeping alone",
    "Math problems (homework, class, tutoring)"
  ]
}

EXAMPLE — Kemp (OCD-style presentation):
{
  "situations": [
    { "name": "Leave house for the day", "fear_thermometer": 6 },
    { "name": "Pack gym bag before games", "fear_thermometer": 8 },
    { "name": "Cleaning lady dusts his shelves and cleans his room", "fear_thermometer": 9 },
    { "name": "Family activities, especially on school days/nights", "fear_thermometer": 9 }
  ],
  "parental_responses": [
    "Provide reassurance.",
    "Change family plans to allow more time for homework.",
    "Get angry.",
    "Do extra laundry or re-launder items for him.",
    "Allow him to skip planned activities when he has a big exam the next day."
  ],
  "safety_behaviors": [
    "Checking.",
    "Sniffing for contaminants.",
    "Ordering and arranging.",
    "Avoidance."
  ],
  "safety_section_label": "Rituals",
  "treatment_targets": [
    "Leave house for the day",
    "Pack gym bag before games",
    "Cleaning lady dusts his shelves and cleans his room",
    "Family activities, especially on school days/nights"
  ]
}
"""


@router.post("/{patient_id}/monitoring/preliminary-report")
async def generate_preliminary_report(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    import json
    import anthropic
    from app.models.monitoring import MonitoringForm, MonitoringEntry

    _, practitioner = context

    # Fetch all (non-draft) monitoring entries for this patient
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
            model="claude-sonnet-4-6",
            max_tokens=3000,
            system=PRELIMINARY_REPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": entries_text}],
        )
        raw_text = message.content[0].text
        clean = raw_text.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
        report = json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI report generation failed: {type(e).__name__}: {str(e)}")
    except Exception as e:
        print(f"Preliminary report error: {type(e).__name__}: {str(e)}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI report generation failed: {type(e).__name__}: {str(e)}"
        )

    report["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Persist onto the clinical formulation (create the row if none exists).
    # Tolerate legacy duplicate rows by taking the most recent.
    formulation_result = await db.execute(
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == patient_id,
            ClinicalFormulation.organization_id == practitioner.organization_id,
        ).order_by(ClinicalFormulation.created_at.desc())
    )
    formulation = formulation_result.scalars().first()
    if formulation is None:
        formulation = ClinicalFormulation(
            patient_id=patient_id,
            organization_id=practitioner.organization_id,
            practitioner_id=practitioner.id,
            preliminary_report=report,
        )
        db.add(formulation)
    else:
        formulation.preliminary_report = report
    await db.commit()

    return report


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
