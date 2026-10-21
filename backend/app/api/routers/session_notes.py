import asyncio
import logging
import uuid
from datetime import date
from typing import Optional
import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.config import settings
from app.core.database import get_db
from app.models.formulation import ClinicalFormulation
from app.models.session_note import SessionNote
from app.models.user import User
from app.models.patient import PractitionerProfile, PatientProfile
from app.services import insight_service, session_analysis_service
from app.api.routers.patients import (
    EXTRACTION_SYSTEM_PROMPT, get_practitioner_context, get_permitted_patient, get_permitted_note,
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
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
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
    return note


@router.put(
    "/notes/{note_id}",
    response_model=SessionNoteResponse
)
async def update_session_note(
    note_id: uuid.UUID,
    data: SessionNoteUpdate,
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
        # Approving reads nothing. The clinician presses Analyze session with AI for that
        # (Peter, 2026-10-21: "We shouldn't have both").
        note.is_draft = False

    await db.commit()
    await db.refresh(note)
    return note


@router.post("/notes/{note_id}/analyze")
async def analyze_session_note(
    note_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_note),
):
    """Analyze session with AI: one approved note, added to the suggestion list and the case summary.

    Two model calls. The first is the monitoring extractor reading the note; what it finds is folded
    into the suggestion list, marked as from this note. The second says what the note adds to the
    case summary, and that is merged in without changing anything already there. Either failing
    saves nothing. Returns the whole case summary. app/services/session_analysis_service.py
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

    # The newest formulation row, as the monitoring analysis picks it.
    latest_formulation = (
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == note.patient_id,
            ClinicalFormulation.organization_id == practitioner.organization_id,
        ).order_by(ClinicalFormulation.created_at.desc()).limit(1)
    )
    formulation = (await db.execute(latest_formulation)).scalars().first()
    current = formulation.preliminary_report if formulation else None

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    # Both model calls before anything is written, so a failure leaves everything as it was. They
    # do not depend on each other, so they run at the same time.
    try:
        raw_extraction, raw_summary = await asyncio.gather(
            asyncio.to_thread(insight_service.request_extraction, client, EXTRACTION_SYSTEM_PROMPT,
                              insight_service.format_session_note(note)),
            asyncio.to_thread(session_analysis_service.request_session_summary, client, current,
                              insight_service.session_note_text(note)),
        )
        extraction = insight_service.parse_model_json(raw_extraction)
        reply = insight_service.parse_model_json(raw_summary)
        if not isinstance(extraction, dict) or not isinstance(reply, dict):
            raise ValueError("the model's answer was not a JSON object")
    except Exception as e:
        logger.exception("session analysis failed for note %s", note_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI could not analyze this session. Please try again.",
        ) from e

    await insight_service.suggest_from_session_note(db, note, extraction)
    # Merged into the summary as it is now, not as it was before the model calls, so a monitoring
    # analysis or another session saved meanwhile is not lost.
    formulation = (await db.execute(
        latest_formulation.with_for_update().execution_options(populate_existing=True)
    )).scalars().first()
    report = session_analysis_service.merge_session(
        formulation.preliminary_report if formulation else None, note_id=note.id, session_date=note.session_date, reply=reply,
    )
    if formulation is None:
        db.add(ClinicalFormulation(
            patient_id=note.patient_id,
            organization_id=practitioner.organization_id,
            practitioner_id=practitioner.id,
            preliminary_report=report,
        ))
    else:
        formulation.preliminary_report = report
    try:
        await db.commit()
    except IntegrityError as e:
        # The patient had no case summary, and another analysis created one at the same moment.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The case summary changed while this session was being analyzed. Please try again.",
        ) from e
    return report


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

    await db.delete(note)
    await db.commit()
