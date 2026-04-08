import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db
from app.models.session_note import SessionNote
from app.models.user import User
from app.models.patient import PractitionerProfile
from app.api.routers.patients import get_practitioner_context


# --- Schemas ---

class SessionNoteCreate(BaseModel):
    session_type: str
    session_date: Optional[date] = None
    content: str


class SessionNoteUpdate(BaseModel):
    session_type: Optional[str] = None
    session_date: Optional[date] = None
    content: Optional[str] = None


class SessionNoteResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    organization_id: uuid.UUID
    practitioner_id: uuid.UUID
    session_type: str
    session_date: date
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Router ---

router = APIRouter(tags=["session-notes"])


@router.get(
    "/patients/{patient_id}/notes",
    response_model=list[SessionNoteResponse]
)
async def list_session_notes(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(SessionNote)
        .where(
            SessionNote.patient_id == patient_id,
            SessionNote.organization_id == practitioner.organization_id
        )
        .order_by(SessionNote.session_date.desc(), SessionNote.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/patients/{patient_id}/notes",
    response_model=SessionNoteResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_session_note(
    patient_id: uuid.UUID,
    data: SessionNoteCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    note = SessionNote(
        patient_id=patient_id,
        organization_id=practitioner.organization_id,
        practitioner_id=practitioner.id,
        session_type=data.session_type,
        session_date=data.session_date or date.today(),
        content=data.content
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.put(
    "/notes/{note_id}",
    response_model=SessionNoteResponse
)
async def update_session_note(
    note_id: uuid.UUID,
    data: SessionNoteUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(SessionNote).where(
            SessionNote.id == note_id,
            SessionNote.organization_id == practitioner.organization_id
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session note not found"
        )

    if data.session_type is not None:
        note.session_type = data.session_type
    if data.session_date is not None:
        note.session_date = data.session_date
    if data.content is not None:
        note.content = data.content

    await db.commit()
    await db.refresh(note)
    return note


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_session_note(
    note_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    result = await db.execute(
        select(SessionNote).where(
            SessionNote.id == note_id,
            SessionNote.organization_id == practitioner.organization_id
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session note not found"
        )

    await db.delete(note)
    await db.commit()
