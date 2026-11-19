"""The clinician guide's ticks for one patient. docs/plans/clinician-guide.md

Only a clinician who may see the patient reads or writes them (`get_permitted_patient`, which also
records the visit in the access log).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.routers.patients import get_practitioner_context, get_permitted_patient
from app.core.database import get_db
from app.models.guide_progress import GuideProgress
from app.models.patient import PatientProfile

router = APIRouter(tags=["guide"])


class GuideTicks(BaseModel):
    ticks: dict


class GuideTicksUpdate(BaseModel):
    ticks: dict[str, bool]


async def _get_or_create(db: AsyncSession, patient_id: uuid.UUID, organization_id: uuid.UUID) -> GuideProgress:
    row = (await db.execute(
        select(GuideProgress).where(
            GuideProgress.patient_id == patient_id,
            GuideProgress.organization_id == organization_id,
        )
    )).scalar_one_or_none()
    if row is None:
        row = GuideProgress(patient_id=patient_id, organization_id=organization_id, ticks={})
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


@router.get("/patients/{patient_id}/guide-ticks", response_model=GuideTicks)
async def get_guide_ticks(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    row = await _get_or_create(db, patient.id, patient.organization_id)
    return GuideTicks(ticks=row.ticks or {})


@router.put("/patients/{patient_id}/guide-ticks", response_model=GuideTicks)
async def update_guide_ticks(
    patient_id: uuid.UUID,
    data: GuideTicksUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    """Merges the keys sent into the saved ones, so one tick is one small request."""
    row = await _get_or_create(db, patient.id, patient.organization_id)
    row.ticks = {**(row.ticks or {}), **data.ticks}
    flag_modified(row, "ticks")
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return GuideTicks(ticks=row.ticks or {})
