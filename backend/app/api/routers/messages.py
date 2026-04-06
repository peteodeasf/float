import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.api.routers.patients import get_practitioner_context
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
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_messages_for_patient(
        db, patient_id, practitioner.organization_id
    )


@router.post("/patients/{patient_id}/messages",
             response_model=MessageResponse,
             status_code=status.HTTP_201_CREATED)
async def create_message(
    patient_id: uuid.UUID,
    data: MessageCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
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
    return await mark_read(db, message_id, practitioner.organization_id)
