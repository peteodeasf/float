import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.patient import PatientProfile
from app.api.routers.patients import get_practitioner_context, get_permitted_patient
from app.services.progress_service import get_patient_progress, get_pre_session_brief
from app.schemas.progress import PatientProgressFull, PreSessionBrief

router = APIRouter(tags=["progress"])


@router.get("/patients/{patient_id}/progress",
            response_model=PatientProgressFull)
async def get_progress(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    return await get_patient_progress(db, patient_id, practitioner.organization_id)


@router.get("/patients/{patient_id}/summary",
            response_model=PreSessionBrief)
async def get_summary(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    return await get_pre_session_brief(db, patient_id, practitioner.organization_id)

# The two buttons that ran reminders and the missed-exposure check by hand are gone: any clinician
# could press them, and they acted on every clinic's patients. The scheduled jobs do both now
# (app/services/reminder_jobs.py, docs/plans/scheduled-jobs.md).
