import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.checklist import ConsultationChecklist
from app.api.routers.patients import get_practitioner_context
from app.services.patient_service import get_patient_by_id


router = APIRouter(tags=["checklist"])


class ChecklistResponse(BaseModel):
    checked_items: dict


class ChecklistUpdate(BaseModel):
    checked_items: dict[str, bool]


async def _get_or_create_checklist(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> ConsultationChecklist:
    result = await db.execute(
        select(ConsultationChecklist).where(
            ConsultationChecklist.patient_id == patient_id,
            ConsultationChecklist.organization_id == organization_id,
        )
    )
    checklist = result.scalar_one_or_none()
    if checklist is None:
        checklist = ConsultationChecklist(
            patient_id=patient_id,
            organization_id=organization_id,
            checked_items={},
        )
        db.add(checklist)
        await db.commit()
        await db.refresh(checklist)
    return checklist


@router.get(
    "/patients/{patient_id}/checklist",
    response_model=ChecklistResponse,
)
async def get_checklist(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    _, practitioner = context
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    checklist = await _get_or_create_checklist(db, patient_id, practitioner.organization_id)
    return ChecklistResponse(checked_items=checklist.checked_items or {})


@router.put(
    "/patients/{patient_id}/checklist",
    response_model=ChecklistResponse,
)
async def update_checklist(
    patient_id: uuid.UUID,
    data: ChecklistUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    _, practitioner = context
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    checklist = await _get_or_create_checklist(db, patient_id, practitioner.organization_id)

    merged = dict(checklist.checked_items or {})
    merged.update(data.checked_items)
    checklist.checked_items = merged
    flag_modified(checklist, "checked_items")
    checklist.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(checklist)
    return ChecklistResponse(checked_items=checklist.checked_items or {})
