import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.patient import PatientProfile
from app.models.checklist import ConsultationChecklist
from app.models.checklist_item import OrganizationChecklistItem
from app.api.routers.patients import get_practitioner_context, get_permitted_patient
from app.services.patient_service import get_patient_by_id
from app.services.checklist_item_service import list_items


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
    _access: PatientProfile = Depends(get_permitted_patient),
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
    _access: PatientProfile = Depends(get_permitted_patient),
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


# ── The organization's process checklist definition ──────────────────────────
# Read-only for clinicians. Editing lives on the admin router: the Float team
# manages these, organizations don't edit their own.
class ChecklistItemOut(BaseModel):
    id: uuid.UUID
    key: str
    text: str
    link_icon: str | None = None
    link_label: str | None = None
    nav_label: str | None = None
    nav_action: str | None = None
    display_order: int
    is_active: bool


def checklist_item_out(row: OrganizationChecklistItem) -> ChecklistItemOut:
    return ChecklistItemOut(
        id=row.id,
        key=row.key,
        text=row.text_,
        link_icon=row.link_icon,
        link_label=row.link_label,
        nav_label=row.nav_label,
        nav_action=row.nav_action,
        display_order=row.display_order,
        is_active=row.is_active,
    )


@router.get("/checklist-items", response_model=list[ChecklistItemOut])
async def get_org_checklist_items(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    """The process checklist for the signed-in clinician's organization."""
    _, practitioner = context
    rows = await list_items(db, practitioner.organization_id)
    return [checklist_item_out(r) for r in rows]
