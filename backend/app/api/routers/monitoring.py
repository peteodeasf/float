import uuid
import secrets
from datetime import date, datetime, timezone
from collections import Counter
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from typing import Optional
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select, update

from app.core.database import get_db, get_session_factory
from app.models.monitoring import MonitoringEntry, MonitoringForm, MonitoringNote
from app.models.patient import PatientProfile, PractitionerProfile
from app.api.routers.patients import get_practitioner_context, get_permitted_patient
from app.services import monitoring_capture as capture


# ── Schemas ──────────────────────────────────────────────────────────────────

class SendMonitoringFormRequest(BaseModel):
    parent_email: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None


class MonitoringEntryCreate(BaseModel):
    entry_date: Optional[str] = None
    situation: Optional[str] = None
    child_behavior_observed: Optional[str] = None
    parent_response: Optional[str] = None
    fear_thermometer: Optional[int] = None
    is_draft: bool = False


class MonitoringEntryUpdate(BaseModel):
    entry_date: Optional[str] = None
    situation: Optional[str] = None
    child_behavior_observed: Optional[str] = None
    parent_response: Optional[str] = None
    fear_thermometer: Optional[int] = None
    is_draft: Optional[bool] = None


def _entry_out(e: MonitoringEntry) -> dict:
    return {
        "id": str(e.id),
        "entry_date": e.entry_date.isoformat(),
        "situation": e.situation,
        "child_behavior_observed": e.child_behavior_observed,
        "parent_response": e.parent_response,
        "fear_thermometer": e.fear_thermometer,
        "is_draft": e.is_draft,
        "parent_words": e.parent_words,
        "captured_by": e.captured_by,
        "note_id": str(e.note_id) if e.note_id else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ── Practitioner endpoints ───────────────────────────────────────────────────

practitioner_router = APIRouter(tags=["monitoring"])


@practitioner_router.post("/patients/{patient_id}/monitoring-form/send")
async def send_monitoring_form(
    patient_id: uuid.UUID,
    data: SendMonitoringFormRequest = SendMonitoringFormRequest(),
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    from app.core.config import settings
    from app.services.email_service import send_monitoring_form_email

    _, practitioner = context

    # Check patient belongs to this org
    patient_result = await db.execute(
        select(PatientProfile).where(
            PatientProfile.id == patient_id,
            PatientProfile.organization_id == practitioner.organization_id
        )
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check for existing form
    existing = await db.execute(
        select(MonitoringForm).where(
            MonitoringForm.patient_id == patient_id,
            MonitoringForm.status.in_(["pending", "in_progress"])
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Monitoring form already exists for this patient"
        )

    access_token = secrets.token_hex(32)
    form = MonitoringForm(
        patient_id=patient_id,
        organization_id=practitioner.organization_id,
        status="pending",
        access_token=access_token,
        sent_at=datetime.now(timezone.utc)
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)

    practitioner_name = practitioner.name
    monitoring_link = f"{settings.BASE_URL}/monitor/{form.access_token}"

    # Store parent phone if provided
    if data.parent_phone:
        form.parent_phone = data.parent_phone
        await db.commit()

    # The address it went to. The evening emails during the monitoring week go there and nowhere
    # else (docs/plans/monitoring-just-say-it.md); a form sent by text only gets none.
    if data.parent_email and data.parent_email.strip():
        form.parent_email = data.parent_email.strip()
        await db.commit()

    # Send email if parent_email provided
    email_sent = False
    if data.parent_email:
        email_sent = await send_monitoring_form_email(
            to_email=data.parent_email,
            clinician_name=practitioner_name,
            monitoring_link=monitoring_link,
            child_name=patient.name,
            parent_name=data.parent_name or ""
        )

    # Send SMS if parent_phone provided
    sms_sent = False
    if data.parent_phone:
        from app.services.sms_service import send_monitoring_form_sms
        sms_sent = await send_monitoring_form_sms(
            to_number=data.parent_phone,
            clinician_name=practitioner_name,
            monitoring_link=monitoring_link,
            child_name=patient.name
        )

    return {
        "id": str(form.id),
        "patient_id": str(form.patient_id),
        "status": form.status,
        "access_token": form.access_token,
        "link": f"/monitor/{form.access_token}",
        "full_link": monitoring_link,
        "practitioner_name": practitioner_name,
        "sent_at": form.sent_at.isoformat() if form.sent_at else None,
        "created_at": form.created_at.isoformat(),
        "email_sent": email_sent,
        "sms_sent": sms_sent
    }


@practitioner_router.get("/patients/{patient_id}/monitoring-form")
async def get_monitoring_form(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context

    result = await db.execute(
        select(MonitoringForm).where(
            MonitoringForm.patient_id == patient_id
        ).order_by(MonitoringForm.created_at.desc())
    )
    form = result.scalar_one_or_none()
    if not form:
        return None

    entries_result = await db.execute(
        select(MonitoringEntry).where(
            MonitoringEntry.monitoring_form_id == form.id
        ).order_by(MonitoringEntry.entry_date.desc())
    )
    entries = entries_result.scalars().all()

    return {
        "id": str(form.id),
        "patient_id": str(form.patient_id),
        "status": form.status,
        "access_token": form.access_token,
        "link": f"/monitor/{form.access_token}",
        "sent_at": form.sent_at.isoformat() if form.sent_at else None,
        "submitted_at": form.submitted_at.isoformat() if form.submitted_at else None,
        "created_at": form.created_at.isoformat(),
        "entries_count": len(entries),
        "entries": [
            _entry_out(e)
            for e in entries
        ]
    }


@practitioner_router.get("/patients/{patient_id}/monitoring-form/situations")
async def get_monitoring_situations(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context

    form_result = await db.execute(
        select(MonitoringForm).where(
            MonitoringForm.patient_id == patient_id
        ).order_by(MonitoringForm.created_at.desc())
    )
    form = form_result.scalar_one_or_none()
    if not form:
        return {"situations": [], "total_entries": 0}

    entries_result = await db.execute(
        select(MonitoringEntry).where(
            MonitoringEntry.monitoring_form_id == form.id,
            MonitoringEntry.is_draft == False  # noqa: E712
        ).order_by(MonitoringEntry.entry_date.asc())
    )
    entries = entries_result.scalars().all()

    # Extract and deduplicate situations
    situation_counts: dict[str, int] = {}
    for e in entries:
        if e.situation and e.situation.strip():
            key = e.situation.strip().lower()
            if key not in situation_counts:
                situation_counts[key] = {"text": e.situation.strip(), "count": 0}
            situation_counts[key]["count"] += 1

    situations = [
        {"text": v["text"], "mention_count": v["count"]}
        for v in situation_counts.values()
    ]
    situations.sort(key=lambda s: s["mention_count"], reverse=True)

    return {"situations": situations, "total_entries": len(entries)}


@practitioner_router.get("/patients/{patient_id}/monitoring-form/report")
async def get_monitoring_report(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context

    # Get patient name
    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    form_result = await db.execute(
        select(MonitoringForm).where(
            MonitoringForm.patient_id == patient_id
        ).order_by(MonitoringForm.created_at.desc())
    )
    form = form_result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="No monitoring form found")

    entries_result = await db.execute(
        select(MonitoringEntry).where(
            MonitoringEntry.monitoring_form_id == form.id,
            MonitoringEntry.is_draft == False  # noqa: E712
        ).order_by(MonitoringEntry.entry_date.asc())
    )
    entries = entries_result.scalars().all()

    if not entries:
        return {
            "patient_id": str(patient_id),
            "patient_name": patient.name,
            "total_entries": 0,
            "date_range": None,
            "dt_range": None,
            "average_dt": None,
            "top_situations_by_frequency": [],
            "top_situations_by_distress": [],
            "parent_response_themes": [],
            "entries": []
        }

    # Date range
    dates = [e.entry_date for e in entries]
    date_range = {
        "from": min(dates).isoformat(),
        "to": max(dates).isoformat(),
        "days": (max(dates) - min(dates)).days + 1
    }

    # DT stats
    dts = [e.fear_thermometer for e in entries if e.fear_thermometer is not None]
    dt_range = {"min": min(dts), "max": max(dts)} if dts else None
    average_dt = round(sum(dts) / len(dts), 1) if dts else None

    # Top situations by frequency — top 5 entries grouped by situation
    situations = [e.situation for e in entries if e.situation]
    freq = Counter(situations)
    top_by_freq = [
        {"situation": s, "count": c}
        for s, c in freq.most_common(5)
    ]

    # Top situations by distress — top 5 entries sorted by fear_thermometer
    entries_with_dt = [e for e in entries if e.fear_thermometer is not None]
    entries_by_distress = sorted(entries_with_dt, key=lambda e: e.fear_thermometer, reverse=True)[:5]
    top_by_distress = [
        {
            "id": str(e.id),
            "entry_date": e.entry_date.isoformat(),
            "situation": e.situation,
            "child_behavior_observed": e.child_behavior_observed,
            "parent_response": e.parent_response,
            "fear_thermometer": e.fear_thermometer,
            "parent_words": e.parent_words,
            "captured_by": e.captured_by,
        }
        for e in entries_by_distress
    ]

    # Parent response themes — parent_response from top 3 highest DT entries
    top_3_distress = sorted(entries_with_dt, key=lambda e: e.fear_thermometer, reverse=True)[:3]
    parent_response_themes = [
        {
            "label": "Highest distress responses",
            "entry_date": e.entry_date.isoformat(),
            "situation": e.situation,
            "parent_response": e.parent_response,
            "fear_thermometer": e.fear_thermometer
        }
        for e in top_3_distress
        if e.parent_response
    ]

    all_entries = [
        {
            "id": str(e.id),
            "entry_date": e.entry_date.isoformat(),
            "situation": e.situation,
            "child_behavior_observed": e.child_behavior_observed,
            "parent_response": e.parent_response,
            "fear_thermometer": e.fear_thermometer,
            "parent_words": e.parent_words,
            "captured_by": e.captured_by,
        }
        for e in entries
    ]

    return {
        "patient_id": str(patient_id),
        "patient_name": patient.name,
        "total_entries": len(entries),
        "date_range": date_range,
        "dt_range": dt_range,
        "average_dt": average_dt,
        "top_situations_by_frequency": top_by_freq,
        "top_situations_by_distress": top_by_distress,
        "parent_response_themes": parent_response_themes,
        "entries": all_entries
    }


# ── Public endpoints (token-based, no auth) ──────────────────────────────────

public_router = APIRouter(tags=["monitoring-public"])


async def get_form_by_token(
    access_token: str,
    db: AsyncSession
) -> MonitoringForm:
    result = await db.execute(
        select(MonitoringForm).where(
            MonitoringForm.access_token == access_token
        )
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@public_router.get("/monitor/{access_token}")
async def get_public_form(
    access_token: str,
    tz: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    form = await get_form_by_token(access_token, db)

    # Where the parent lives, for the evening email during the monitoring week. Only a real time
    # zone name is kept. docs/plans/monitoring-just-say-it.md
    if tz and len(tz) <= 64 and tz != form.parent_timezone:
        try:
            ZoneInfo(tz)
        except Exception:
            pass
        else:
            form.parent_timezone = tz
            await db.commit()

    # Get patient name
    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == form.patient_id)
    )
    patient = patient_result.scalar_one_or_none()

    # Get practitioner name
    practitioner_name = None
    if patient and patient.primary_practitioner_id:
        prac_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.id == patient.primary_practitioner_id
            )
        )
        prac = prac_result.scalar_one_or_none()
        if prac:
            practitioner_name = prac.name

    # Get entries
    entries_result = await db.execute(
        select(MonitoringEntry).where(
            MonitoringEntry.monitoring_form_id == form.id
        ).order_by(MonitoringEntry.entry_date.desc())
    )
    entries = entries_result.scalars().all()
    notes = (await db.execute(
        select(MonitoringNote).where(MonitoringNote.monitoring_form_id == form.id)
        .order_by(MonitoringNote.created_at.desc())
    )).scalars().all()

    # Update status to in_progress if still pending and being viewed
    if form.status == "pending":
        form.status = "in_progress"
        await db.commit()

    return {
        "id": str(form.id),
        "status": form.status,
        "patient_first_name": patient.name.split()[0] if patient else None,
        "practitioner_name": practitioner_name,
        # Recording is offered only once Google is set up; typing a quick note always works.
        "voice_available": capture.voice_available(),
        # What they said or typed, in their words. The observations written up from these are in
        # `entries` with a note_id, for the clinician; the parent sees the words.
        "notes": [_note_out(n) for n in notes],
        "entries": [
            _entry_out(e)
            for e in entries
        ]
    }


@public_router.post("/monitor/{access_token}/entries")
async def create_entry(
    access_token: str,
    data: MonitoringEntryCreate,
    db: AsyncSession = Depends(get_db)
):
    form = await get_form_by_token(access_token, db)

    if form.status == "submitted":
        raise HTTPException(status_code=400, detail="Form already submitted")

    from datetime import date as date_type
    entry_date = date_type.fromisoformat(data.entry_date) if data.entry_date else date_type.today()

    entry = MonitoringEntry(
        monitoring_form_id=form.id,
        entry_date=entry_date,
        situation=data.situation,
        child_behavior_observed=data.child_behavior_observed,
        parent_response=data.parent_response,
        fear_thermometer=data.fear_thermometer,
        is_draft=data.is_draft
    )
    db.add(entry)

    # Update form status
    if form.status == "pending":
        form.status = "in_progress"

    await db.commit()
    await db.refresh(entry)

    return _entry_out(entry)


@public_router.put("/monitor/{access_token}/entries/{entry_id}")
async def update_entry(
    access_token: str,
    entry_id: uuid.UUID,
    data: MonitoringEntryUpdate,
    db: AsyncSession = Depends(get_db)
):
    form = await get_form_by_token(access_token, db)

    if form.status == "submitted":
        raise HTTPException(status_code=400, detail="Form already submitted")

    entry_result = await db.execute(
        select(MonitoringEntry).where(
            MonitoringEntry.id == entry_id,
            MonitoringEntry.monitoring_form_id == form.id
        )
    )
    entry = entry_result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if data.entry_date is not None:
        from datetime import date as date_type
        entry.entry_date = date_type.fromisoformat(data.entry_date)
    if data.situation is not None:
        entry.situation = data.situation
    if data.child_behavior_observed is not None:
        entry.child_behavior_observed = data.child_behavior_observed
    if data.parent_response is not None:
        entry.parent_response = data.parent_response
    if data.fear_thermometer is not None:
        entry.fear_thermometer = data.fear_thermometer
    if data.is_draft is not None:
        entry.is_draft = data.is_draft

    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)

    return _entry_out(entry)


@public_router.post("/monitor/{access_token}/submit")
async def submit_form(
    access_token: str,
    db: AsyncSession = Depends(get_db)
):
    form = await get_form_by_token(access_token, db)

    if form.status == "submitted":
        raise HTTPException(status_code=400, detail="Form already submitted")

    form.status = "submitted"
    form.submitted_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "submitted"}


class MonitorConsentRequest(BaseModel):
    granted: bool = True


@public_router.post("/monitor/{access_token}/consent")
async def record_parent_consent(
    access_token: str,
    data: MonitorConsentRequest,
    db: AsyncSession = Depends(get_db)
):
    """Parent-given consent (from the monitoring form) to connect the child into
    the app. Token-scoped to this form's patient; records it once."""
    form = await get_form_by_token(access_token, db)
    if data.granted:
        patient = await db.get(PatientProfile, form.patient_id)
        if patient is not None and patient.child_connect_consent_at is None:
            patient.child_connect_consent_at = datetime.now(timezone.utc)
            patient.consent_source = "parent_form"
            await db.commit()
    return {"status": "ok"}


# ── Just say it: an observation said out loud, or typed as a quick note ──────
# docs/plans/monitoring-just-say-it.md. The same bargain as the rest of the form: the unguessable
# token instead of a login. These call paid services, so each form has a daily limit.
# Peter, 2026-09-12: the parent just talks and it goes. No form to check.

def _refuse_if_submitted(form: MonitoringForm) -> None:
    if form.status == "submitted":
        raise HTTPException(status_code=400, detail="Form already submitted")


async def _count_capture(db: AsyncSession, form: MonitoringForm) -> None:
    """Counted before the paid call, so a failed one still counts."""
    today = datetime.now(timezone.utc).date()
    if form.capture_day != today:
        form.capture_day, form.capture_count = today, 0
    if form.capture_count >= capture.DAILY_LIMIT:
        raise HTTPException(status_code=429, detail="That's the most for one day. You can still use the form.")
    form.capture_count += 1
    await db.commit()


def _parent_today(value: Optional[str]) -> date:
    """The parent's own date, so "this morning" is their morning. More than a day from ours is taken
    as a wrong clock."""
    ours = datetime.now(timezone.utc).date()
    try:
        today = date.fromisoformat(value) if value else ours
    except ValueError:
        return ours
    return today if abs((today - ours).days) <= 1 else ours


def _note_out(n: MonitoringNote) -> dict:
    return {
        "id": str(n.id),
        "words": n.words,
        "captured_by": n.captured_by,
        "entry_date": n.entry_date.isoformat(),
        "fear_level": n.fear_level,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


async def _save_note(db: AsyncSession, form: MonitoringForm, words: str, captured_by: str, today: Optional[str],
                     background: BackgroundTasks, sessions) -> dict:
    note = MonitoringNote(monitoring_form_id=form.id, words=words, captured_by=captured_by,
                          entry_date=_parent_today(today))
    db.add(note)
    await db.commit()
    await db.refresh(note)
    # Written up after the response: the parent is told "Got it" without waiting for Claude.
    background.add_task(capture.write_up_note, sessions, note.id)
    return {"note": _note_out(note)}


@public_router.post("/monitor/{access_token}/notes/voice")
async def say_it(
    access_token: str,
    background: BackgroundTasks,
    audio: UploadFile = File(...),
    today: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
):
    """A recording of up to a minute. Turned into text before the parent is told "Got it", so a
    recording with nothing heard can be tried again. The recording is not stored."""
    form = await get_form_by_token(access_token, db)
    _refuse_if_submitted(form)
    if not capture.voice_available():
        raise HTTPException(status_code=503, detail="Recording isn't available yet. You can type it instead.")
    if not (audio.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=415, detail="That isn't a recording.")
    data = await audio.read(capture.MAX_AUDIO_BYTES + 1)
    if len(data) > capture.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="That recording is too long. Keep it to a minute.")
    if not data:
        raise HTTPException(status_code=400, detail="That recording is empty.")
    await _count_capture(db, form)
    try:
        words = (await capture.transcribe(data)).strip()
    except capture.CaptureFailed:
        raise HTTPException(status_code=502, detail="We couldn't turn that into text. Try again, or type it.")
    if not words:
        raise HTTPException(status_code=422, detail="We couldn't hear that. Try again, or type it.")
    return await _save_note(db, form, words[:capture.MAX_NOTE_CHARS], "voice", today, background, sessions)


class NoteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=capture.MAX_NOTE_CHARS)
    today: Optional[str] = None


@public_router.post("/monitor/{access_token}/notes/text")
async def write_it(
    access_token: str,
    data: NoteRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    sessions=Depends(get_session_factory),
):
    """A quick typed note, the same way as a recording."""
    form = await get_form_by_token(access_token, db)
    _refuse_if_submitted(form)
    words = data.text.strip()
    if not words:
        raise HTTPException(status_code=422, detail="There's nothing to send.")
    await _count_capture(db, form)
    return await _save_note(db, form, words, "note", data.today, background, sessions)


async def _note_on_form(db: AsyncSession, form: MonitoringForm, note_id: uuid.UUID) -> MonitoringNote:
    note = (await db.execute(
        select(MonitoringNote).where(
            MonitoringNote.id == note_id,
            MonitoringNote.monitoring_form_id == form.id,
        ).with_for_update()
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Not found")
    return note


class NoteFearRequest(BaseModel):
    fear_level: int = Field(ge=1, le=10)


@public_router.put("/monitor/{access_token}/notes/{note_id}/fear")
async def note_fear(
    access_token: str,
    note_id: uuid.UUID,
    data: NoteFearRequest,
    db: AsyncSession = Depends(get_db),
):
    """The one tap after recording: how upset the child was. It fills every moment in the note the
    parent gave no number for. A number they said stays."""
    form = await get_form_by_token(access_token, db)
    _refuse_if_submitted(form)
    note = await _note_on_form(db, form, note_id)
    note.fear_level = data.fear_level
    await db.execute(
        update(MonitoringEntry)
        .where(MonitoringEntry.note_id == note.id, MonitoringEntry.fear_thermometer.is_(None))
        .values(fear_thermometer=data.fear_level)
    )
    await db.commit()
    return {"note": _note_out(note)}


@public_router.delete("/monitor/{access_token}/notes/{note_id}", status_code=204)
async def delete_note(
    access_token: str,
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """A recording or note the parent did not mean to send, and everything written up from it."""
    form = await get_form_by_token(access_token, db)
    _refuse_if_submitted(form)
    note = await _note_on_form(db, form, note_id)
    await db.execute(delete(MonitoringEntry).where(MonitoringEntry.note_id == note.id))
    await db.delete(note)
    await db.commit()
    return Response(status_code=204)


@public_router.post("/monitor/{access_token}/reminders-off")
async def monitoring_reminders_off(
    access_token: str,
    db: AsyncSession = Depends(get_db),
):
    """The off link in the evening email. All it can do is stop those emails for this form."""
    form = await get_form_by_token(access_token, db)
    if form.reminders_off_at is None:
        form.reminders_off_at = datetime.now(timezone.utc)
        await db.commit()
    return {"status": "off"}

