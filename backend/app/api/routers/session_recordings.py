"""Recording a session on the clinician's phone. docs/plans/session-recording.md

Every route is the clinician's, through the same patient access check as the patient's other
records. A recording is reached by its own id only after it resolves back to a patient this
clinician may see.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.patients import _require, get_permitted_patient, get_practitioner_context
from app.core.database import get_db, get_session_factory
from app.models.patient import PatientProfile
from app.models.session_note import SessionRecording
from app.services import google_cloud as google
from app.services import session_recording as recorder
from app.services.patient_access_service import patient_of_record

router = APIRouter(tags=["session-recordings"])


class ConsentIn(BaseModel):
    #: Who agreed, in the clinician's words: "Sam and her mother, verbally".
    agreed_by: str = Field(min_length=1, max_length=300)


class RecordingCreate(BaseModel):
    participants: list[Literal["patient", "parent"]] = Field(min_length=1, max_length=2)
    content_type: str = Field(pattern=r"^audio/[a-z0-9.+-]+(;.*)?$", max_length=100)


def _out(rec: SessionRecording) -> dict:
    return {
        "id": str(rec.id),
        "patient_id": str(rec.patient_id),
        "status": rec.status,
        "participants": list(rec.participants or []),
        "segments": rec.segments,
        "error": rec.error,
        "session_note_id": str(rec.session_note_id) if rec.session_note_id else None,
        "started_at": rec.started_at.isoformat() if rec.started_at else None,
        "stopped_at": rec.stopped_at.isoformat() if rec.stopped_at else None,
    }


async def get_permitted_recording(
    recording_id: uuid.UUID,
    request: Request,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
) -> SessionRecording:
    await _require(db, context, await patient_of_record(db, SessionRecording, recording_id), request)
    return await db.get(SessionRecording, recording_id)


@router.post("/patients/{patient_id}/recording-consent")
async def confirm_recording_consent(
    data: ConsentIn,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    """The clinician confirms everyone in the session agreed to it being recorded."""
    _, practitioner = context
    patient.recording_consent_at = datetime.now(timezone.utc)
    patient.recording_consent_by = data.agreed_by.strip()
    patient.recording_consent_practitioner_id = practitioner.id
    await db.commit()
    return {"recording_consent_at": patient.recording_consent_at.isoformat(), "recording_consent_by": patient.recording_consent_by}


@router.get("/patients/{patient_id}/recordings")
async def list_recordings(
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    """Recordings not yet turned into a note: still recording, being written up, or failed."""
    rows = (await db.execute(
        select(SessionRecording).where(
            SessionRecording.patient_id == patient.id,
            SessionRecording.status != "done",
        ).order_by(SessionRecording.started_at.desc()).limit(10)
    )).scalars().all()
    return [_out(r) for r in rows]


@router.post("/patients/{patient_id}/recordings", status_code=status.HTTP_201_CREATED)
async def start_recording(
    data: RecordingCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    if not google.configured():
        raise HTTPException(status_code=503, detail="Recording a session isn't set up yet.")
    if patient.closed_at is not None:
        raise HTTPException(status_code=409, detail="This patient's treatment is closed.")
    if patient.recording_consent_at is None:
        raise HTTPException(status_code=409, detail="Confirm that everyone has agreed to the recording first.")
    rec = SessionRecording(
        patient_id=patient.id,
        organization_id=patient.organization_id,
        practitioner_id=practitioner.id,
        participants=list(dict.fromkeys(data.participants)),
        content_type=data.content_type.split(";")[0].strip(),
        status="recording",
        started_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return _out(rec)


@router.put("/recordings/{recording_id}/segments/{segment}/pieces/{seq}", status_code=204)
async def upload_piece(
    segment: int,
    seq: int,
    request: Request,
    rec: SessionRecording = Depends(get_permitted_recording),
    db: AsyncSession = Depends(get_db),
):
    """Thirty seconds or so of the recording. Sending the same piece again replaces it."""
    if rec.status != "recording":
        raise HTTPException(status_code=409, detail="This recording has already been stopped.")
    if not (1 <= segment <= recorder.MAX_SEGMENTS) or not (0 <= seq < recorder.MAX_PIECES):
        raise HTTPException(status_code=422, detail="That piece is out of range.")
    if not (request.headers.get("content-type") or "").startswith("audio/"):
        raise HTTPException(status_code=415, detail="That isn't audio.")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="That piece is empty.")
    if len(data) > recorder.MAX_PIECE_BYTES:
        raise HTTPException(status_code=413, detail="That piece is too large.")
    try:
        await google.put_object(recorder.piece_name(rec.id, segment, seq), data, rec.content_type)
    except google.GoogleFailed:
        raise HTTPException(status_code=502, detail="That piece didn't upload. It will be tried again.")
    rec.segments = max(rec.segments, segment)
    rec.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)


@router.post("/recordings/{recording_id}/stop")
async def stop_recording(
    background: BackgroundTasks,
    rec: SessionRecording = Depends(get_permitted_recording),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
):
    """Stop and save. The note is written after the response; the page does not wait for it."""
    if rec.status == "recording":
        rec.status = "stopped"
        rec.stopped_at = datetime.now(timezone.utc)
        rec.updated_at = rec.stopped_at
        await db.commit()
        background.add_task(recorder.settle, sessions, rec.id)
    return _out(rec)


@router.get("/recordings/{recording_id}")
async def get_recording(rec: SessionRecording = Depends(get_permitted_recording)):
    return _out(rec)


@router.post("/recordings/{recording_id}/retry")
async def retry_recording(
    background: BackgroundTasks,
    rec: SessionRecording = Depends(get_permitted_recording),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
):
    if rec.status != "failed":
        raise HTTPException(status_code=409, detail="Only a recording that failed can be tried again.")
    jobs = rec.jobs or []
    # Transcript already back from Google: only the note is written again.
    rec.status = "transcribing" if jobs and all(j.get("turns") is not None for j in jobs) else "stopped"
    rec.error = None
    rec.updated_at = datetime.now(timezone.utc)
    await db.commit()
    background.add_task(recorder.settle, sessions, rec.id)
    return _out(rec)


@router.delete("/recordings/{recording_id}", status_code=204)
async def discard_recording(
    rec: SessionRecording = Depends(get_permitted_recording),
    db: AsyncSession = Depends(get_db),
):
    """Throw a recording away, and its audio with it. One already written up is a note: delete that."""
    if rec.status == "done":
        raise HTTPException(status_code=409, detail="This recording is already a note.")
    try:
        await google.delete_prefix(recorder.recording_prefix(rec.id))
    except google.GoogleFailed:
        raise HTTPException(status_code=502, detail="The recording couldn't be deleted. Try again.")
    await db.delete(rec)
    await db.commit()
    return Response(status_code=204)
