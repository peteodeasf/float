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


async def _parent_of(db: AsyncSession, patient: PatientProfile, parent_user_id: uuid.UUID) -> uuid.UUID:
    link = (await db.execute(
        select(ParentPatientLink).where(
            ParentPatientLink.patient_id == patient.id,
            ParentPatientLink.parent_user_id == parent_user_id,
        )
    )).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=400, detail="Not a parent of this patient")
    return parent_user_id


@router.get("/patients/{patient_id}/parent-messages", response_model=list[MessageResponse])
async def list_parent_messages(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """Every parent message on this child, whichever parent it was with."""
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


@router.get("/patients/{patient_id}/parents/{parent_user_id}/messages", response_model=list[MessageResponse])
async def list_one_parents_messages(
    patient_id: uuid.UUID,
    parent_user_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """The clinician's conversation with one parent. Where a child has two parents they get a
    thread each, and neither sees the other's (docs/plans/two-parent-accounts.md)."""
    _, practitioner = context
    patient = await _load_patient(db, patient_id, practitioner.organization_id)
    await _parent_of(db, patient, parent_user_id)
    rows = (await db.execute(
        select(Message)
        .where(
            Message.patient_id == patient.id,
            Message.audience == "parent",
            Message.organization_id == practitioner.organization_id,
            or_(
                Message.recipient_user_id == parent_user_id,
                Message.sender_user_id == parent_user_id,
            ),
        )
        .order_by(Message.created_at.asc())
    )).scalars().all()
    return rows


@router.post(
    "/patients/{patient_id}/parents/{parent_user_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_parent_message(
    patient_id: uuid.UUID,
    parent_user_id: uuid.UUID,
    data: ParentThreadMessageCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    patient = await _load_patient(db, patient_id, practitioner.organization_id)
    # Which parent this is to. It used to be whichever parent row came back first, which sent the
    # message to the wrong one of two parents (docs/plans/two-parent-accounts.md).
    recipient_id = await _parent_of(db, patient, parent_user_id)
    message = Message(
        organization_id=practitioner.organization_id,
        sender_user_id=practitioner.user_id,
        recipient_user_id=recipient_id,
        patient_id=patient.id,
        content=data.content,
        message_type=data.message_type,
        audience="parent",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message
