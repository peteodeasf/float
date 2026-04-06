import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.progress_service import get_patient_progress, get_pre_session_brief
from app.services.missed_experiment_service import detect_missed_experiments
from app.schemas.progress import PatientProgressFull, PreSessionBrief

router = APIRouter(tags=["progress"])


@router.get("/patients/{patient_id}/progress",
            response_model=PatientProgressFull)
async def get_progress(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_patient_progress(db, patient_id, practitioner.organization_id)


@router.get("/patients/{patient_id}/summary",
            response_model=PreSessionBrief)
async def get_summary(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_pre_session_brief(db, patient_id, practitioner.organization_id)


@router.post("/admin/detect-missed-experiments")
async def run_missed_experiment_detection(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    count = await detect_missed_experiments(db)
    return {"missed_experiments_found": count}
