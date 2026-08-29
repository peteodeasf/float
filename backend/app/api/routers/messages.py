import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.message import Message
from app.models.patient import PatientProfile, ParentPatientLink
from app.api.routers.patients import (
    get_practitioner_context,
    get_permitted_patient,
    _require,
)
from app.services.patient_access_service import patient_of_record
from app.services.message_service import (
    get_messages_for_patient,
    send_message,
    mark_read
)
from app.schemas.message import MessageCreate, MessageResponse

router = APIRouter(tags=["messages"])


@router.get("/patients/{patient_id}/messages",
            response_model=list[MessageResponse])
async def list_messages(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    patient_result = await db.execute(
        select(PatientProfile).where(
            PatientProfile.id == patient_id,
            PatientProfile.organization_id == practitioner.organization_id,
        )
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    result = await db.execute(
        select(Message)
        .where(
            Message.organization_id == practitioner.organization_id,
            or_(
                Message.sender_user_id == patient.user_id,
                Message.recipient_user_id == patient.user_id,
            ),
        )
        .order_by(Message.created_at.asc())
    )
    return result.scalars().all()


@router.post("/patients/{patient_id}/messages",
             response_model=MessageResponse,
             status_code=status.HTTP_201_CREATED)
async def create_message(
    patient_id: uuid.UUID,
    data: MessageCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    return await send_message(
        db,
        patient_id,
        practitioner.organization_id,
        practitioner.user_id,
        data
    )


@router.put("/messages/{message_id}/read",
            response_model=MessageResponse)
async def read_message(
    message_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.models.patient import PractitionerProfile
    from sqlalchemy import select
    result = await db.execute(
        select(PractitionerProfile)
        .where(PractitionerProfile.user_id == current_user.id)
    )
    practitioner = result.scalar_one_or_none()
    if not practitioner:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized")
    # Only for a patient this clinician has been granted. In the handler rather than a dependency
    # because the message id, not a patient id, is what the route is keyed on.
    await _require(db, (current_user, practitioner),
                   await patient_of_record(db, Message, message_id), request)
    return await mark_read(db, message_id, practitioner.organization_id)


# ── Parent thread (audience='parent') — the separate parent<->clinician chat ──

class ParentThreadMessageCreate(BaseModel):
    content: str
    message_type: str = "general"


async def _load_patient(db: AsyncSession, patient_id: uuid.UUID, org_id: uuid.UUID) -> PatientProfile:
    patient = (await db.execute(
        select(PatientProfile).where(
            PatientProfile.id == patient_id,
            PatientProfile.organization_id == org_id,
        )
    )).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/patients/{patient_id}/parent-messages", response_model=list[MessageResponse])
async def list_parent_messages(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    patient = await _load_patient(db, patient_id, practitioner.organization_id)
    rows = (await db.execute(
        select(Message)
        .where(
            Message.patient_id == patient.id,
            Message.audience == "parent",
            Message.organization_id == practitioner.organization_id,
        )
        .order_by(Message.created_at.asc())
    )).scalars().all()
    return rows


@router.post(
    "/patients/{patient_id}/parent-messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_parent_message(
    patient_id: uuid.UUID,
    data: ParentThreadMessageCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    patient = await _load_patient(db, patient_id, practitioner.organization_id)
    link = (await db.execute(
        select(ParentPatientLink).where(ParentPatientLink.patient_id == patient.id)
    )).scalars().first()
    if not link:
        raise HTTPException(status_code=400, detail="No parent linked to this patient")
    message = Message(
        organization_id=practitioner.organization_id,
        sender_user_id=practitioner.user_id,
        recipient_user_id=link.parent_user_id,
        patient_id=patient.id,
        content=data.content,
        message_type=data.message_type,
        audience="parent",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message
