import logging
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db, get_session_factory
from app.models.formulation import ClinicalFormulation
from app.models.session_note import SessionNote
from app.models.user import User
from app.models.patient import PractitionerProfile, PatientProfile
from app.models import ai_suggestion as ai
from app.services import ai_record, case_summary_service, session_analysis_service
from app.api.routers.patients import (
    get_practitioner_context, get_permitted_patient, get_permitted_note,
)

logger = logging.getLogger(__name__)


# --- Schemas ---

class SessionNoteCreate(BaseModel):
    # `session_type` is legacy/optional now; new notes use participants + tags.
    session_type: Optional[str] = None
    participants: list[str] = []  # any of 'parent', 'patient'
    tags: list[str] = []
    session_date: Optional[date] = None
    content: str


class SessionNoteUpdate(BaseModel):
    session_type: Optional[str] = None
    participants: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    session_date: Optional[date] = None
    content: Optional[str] = None
    # A note from a recording: who each speaker is, and approving the draft (False only).
    # docs/plans/session-recording.md
    speaker_names: Optional[dict[str, str]] = None
    is_draft: Optional[bool] = None


class SessionNoteResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    organization_id: uuid.UUID
    practitioner_id: uuid.UUID
    session_type: Optional[str] = None
    participants: list[str] = []
    tags: list[str] = []
    session_date: date
    content: str
    is_draft: bool = False
    source: str = "typed"
    transcript: Optional[list[dict]] = None
    speaker_names: Optional[dict[str, str]] = None
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
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
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
    background: BackgroundTasks,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    note = SessionNote(
        patient_id=patient_id,
        organization_id=practitioner.organization_id,
        practitioner_id=practitioner.id,
        session_type=data.session_type,
        participants=data.participants,
        tags=data.tags or [],
        session_date=data.session_date or date.today(),
        content=data.content
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    # A typed note is approved when saved, so it goes into the case summary now (after the
    # response: the clinician does not wait for the AI).
    if case_summary_service.note_is_ready(note):
        case_summary_service.schedule(background, sessions, note.patient_id, note_id=note.id)
    return note


@router.put(
    "/notes/{note_id}",
    response_model=SessionNoteResponse
)
async def update_session_note(
    note_id: uuid.UUID,
    data: SessionNoteUpdate,
    background: BackgroundTasks,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
    _access: None = Depends(get_permitted_note),
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

    # What the case summary reads from the note: approval, its text and its date.
    before = (note.is_draft, note.content, note.session_date)

    if data.session_type is not None:
        note.session_type = data.session_type
    if data.participants is not None:
        note.participants = data.participants
    if data.tags is not None:
        note.tags = data.tags
    if data.session_date is not None:
        note.session_date = data.session_date
    if data.content is not None:
        note.content = data.content
    if data.speaker_names is not None:
        keys = {t.get("speaker") for t in (note.transcript or [])}
        names = {k: v.strip() for k, v in data.speaker_names.items()}
        if not keys or not set(names) <= keys or any(not v or len(v) > 40 for v in names.values()):
            raise HTTPException(status_code=422, detail="Those speakers aren't in this transcript.")
        note.speaker_names = {**(note.speaker_names or {}), **names}
    if data.is_draft is not None:
        if data.is_draft:
            raise HTTPException(status_code=422, detail="A note can be approved, not made a draft again.")
        note.is_draft = False
        # Approving settles the drafted note: kept as written, or edited.
        await ai_record.decide(
            db, job=ai.SESSION_NOTE_DRAFT, source={"session_note_id": str(note.id)},
            user_id=practitioner.user_id, kept={"content": note.content}, compare="content",
        )

    await db.commit()
    await db.refresh(note)
    # Approved, or an approved note's text or date changed: the case summary is updated on its own
    # (Peter, 2026-11-18). docs/plans/case-summary-auto-refresh.md
    if case_summary_service.note_is_ready(note) and before != (note.is_draft, note.content, note.session_date):
        case_summary_service.schedule(background, sessions, note.patient_id, note_id=note.id)
    return note


@router.post("/notes/{note_id}/analyze")
async def analyze_session_note(
    note_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_note),
):
    """One approved note, added to the suggestion list and the case summary, now.

    The page no longer has a button for this (Peter, 2026-11-18): a note is analyzed on its own when
    it is saved approved, approved, or edited. Kept for that work's tests and as a way to run it for
    one note. app/services/case_summary_service.py
    """
    _, practitioner = context
    note = (await db.execute(
        select(SessionNote).where(
            SessionNote.id == note_id,
            SessionNote.organization_id == practitioner.organization_id,
        )
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session note not found")
    # The clinician has read and approved the note; a draft is still software's guess at the session.
    if note.is_draft:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approve the note before analyzing it.")
    if not (note.content or "").strip():
        raise HTTPException(status_code=422, detail="This note is empty.")

    async with case_summary_service.patient_lock(note.patient_id):
        try:
            return await case_summary_service.analyze_note(
                db, note, practitioner_id=practitioner.id, triggered_by_user_id=practitioner.user_id,
            )
        except case_summary_service.AnalysisFailed as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e
        except case_summary_service.AnalysisConflict as e:
            # The patient had no case summary, and another analysis created one at the same moment.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The case summary changed while this session was being analyzed. Please try again.",
            ) from e


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_session_note(
    note_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_note),
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

    # What Analyze session with AI added from this note goes with it: a note deleted because it was
    # on the wrong patient must not leave its content in this patient's Case Summary.
    formulations = (await db.execute(
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == note.patient_id,
            ClinicalFormulation.organization_id == practitioner.organization_id,
        ).with_for_update()
    )).scalars().all()
    for f in formulations:
        if f.preliminary_report and f.preliminary_report.get("session_additions"):
            f.preliminary_report = session_analysis_service.without_session(f.preliminary_report, note.id)

    # A draft from a recording deleted without being approved: the clinician turned it down.
    if note.is_draft:
        await ai_record.decide(
            db, job=ai.SESSION_NOTE_DRAFT, source={"session_note_id": str(note.id)},
            user_id=practitioner.user_id, kept=None,
        )
    await db.delete(note)
    await db.commit()
