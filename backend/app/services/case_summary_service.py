"""The case summary, kept up to date on its own. docs/plans/case-summary-auto-refresh.md

Two analyses write it. The monitoring analysis reads the whole log and rewrites the summary. The
session analysis reads one approved note and puts what it adds into that note's block. Both run
when something new arrives: a monitoring entry, or a session note saved or approved. AI Refresh on
the Case Summary tab runs them by hand.

One patient's analyses run one at a time. What arrives during a run is done straight after it, all
together, so two entries saved during one run cause one more run that reads both.
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import anthropic
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.formulation import ClinicalFormulation
from app.models.monitoring import MonitoringEntry, MonitoringForm
from app.models.patient import PatientProfile
from app.models.session_note import SessionNote
from app.services import insight_service, session_analysis_service

logger = logging.getLogger(__name__)

# The monitoring analysis runs on its own once the log has this many entries.
MIN_MONITORING_ENTRIES = 3


class AnalysisFailed(Exception):
    """The model failed or answered with something unusable. Nothing was saved."""


class AnalysisConflict(Exception):
    """Another analysis created the patient's first summary at the same moment. Nothing was saved."""


def _latest_formulation(patient_id, organization_id):
    # Tolerates legacy duplicate rows by taking the most recent.
    return (
        select(ClinicalFormulation).where(
            ClinicalFormulation.patient_id == patient_id,
            ClinicalFormulation.organization_id == organization_id,
        ).order_by(ClinicalFormulation.created_at.desc()).limit(1)
    )


async def _entries(db: AsyncSession, patient_id, organization_id) -> list[MonitoringEntry]:
    return list((await db.execute(
        select(MonitoringEntry)
        .join(MonitoringForm, MonitoringEntry.monitoring_form_id == MonitoringForm.id)
        .where(
            MonitoringForm.patient_id == patient_id,
            MonitoringForm.organization_id == organization_id,
            MonitoringEntry.is_draft == False,  # noqa: E712
        )
        .order_by(MonitoringEntry.entry_date.asc())
    )).scalars().all())


async def count_entries(db: AsyncSession, patient_id, organization_id) -> int:
    return (await db.execute(
        select(func.count()).select_from(MonitoringEntry)
        .join(MonitoringForm, MonitoringEntry.monitoring_form_id == MonitoringForm.id)
        .where(
            MonitoringForm.patient_id == patient_id,
            MonitoringForm.organization_id == organization_id,
            MonitoringEntry.is_draft == False,  # noqa: E712
        )
    )).scalar_one()


# ── The monitoring analysis ───────────────────────────────────────────────────

async def refresh_from_monitoring(
    db: AsyncSession, *, patient_id, organization_id, practitioner_id,
) -> Optional[dict]:
    """Build the patient's saved list from the monitoring log, then write the summary from it.

    Two model calls, in order. The first pulls situations, behaviours and accommodations out of the
    log and folds them into `patient_insights`, keeping the clinician's decisions. The second
    writes the report from that list rather than going back to the raw log, so the Treatment
    Targets in the report and the situations offered in the ladder builder are the same list in the
    same words. See docs/plans/patient-specific-suggestions.md.

    Returns the summary, or None when there are no entries. Commits.
    """
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT, PRELIMINARY_REPORT_SYSTEM_PROMPT
    from app.services.treatment_plan_service import get_active_plan

    entries = await _entries(db, patient_id, organization_id)
    if not entries:
        return None

    entries_text, by_number = insight_service.format_entries(entries)
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # ── 1. The list ───────────────────────────────────────────────────────────
    # The model calls block, so they run on a thread: the server keeps answering meanwhile.
    try:
        extraction = insight_service.parse_model_json(await asyncio.to_thread(
            insight_service.request_extraction, client, EXTRACTION_SYSTEM_PROMPT, entries_text
        ))
    except Exception as e:
        logger.exception("insight build failed for patient %s", patient_id)
        raise AnalysisFailed(f"AI analysis failed: {type(e).__name__}: {e}") from e

    await insight_service.rebuild_from_monitoring(
        db,
        patient_id=patient_id,
        organization_id=organization_id,
        extraction=extraction,
        entry_ids_by_situation=insight_service.entry_ids_by_situation(extraction, by_number),
    )
    insights = insight_service.from_monitoring(await insight_service.get_insights(
        db, patient_id=patient_id, organization_id=organization_id
    ))

    # ── 2. The report, written from the list ──────────────────────────────────
    try:
        report = insight_service.parse_model_json(await asyncio.to_thread(
            insight_service.request_report, client, PRELIMINARY_REPORT_SYSTEM_PROMPT, insights, entries_text
        ))
    except Exception as e:
        logger.exception("preliminary report failed for patient %s", patient_id)
        await db.rollback()
        raise AnalysisFailed(f"AI report generation failed: {type(e).__name__}: {e}") from e

    report["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Locked, so a session analysis saved at the same moment is not lost from session_additions.
    formulation = (await db.execute(
        _latest_formulation(patient_id, organization_id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalars().first()
    if formulation is None:
        db.add(ClinicalFormulation(
            patient_id=patient_id,
            organization_id=organization_id,
            practitioner_id=practitioner_id,
            preliminary_report=report,
        ))
    else:
        # What sessions added is kept apart and carried across, so re-analyzing the log cannot drop
        # it. app/services/session_analysis_service.py
        kept = (formulation.preliminary_report or {}).get("session_additions")
        if kept:
            report["session_additions"] = kept
        formulation.preliminary_report = report

    # This run IS the analysis now, so it is what "Last analyzed" means.
    plan = await get_active_plan(db, patient_id, organization_id)
    if plan is not None:
        plan.last_extracted_at = datetime.now(timezone.utc)

    await db.commit()
    return report


# ── The session analysis ──────────────────────────────────────────────────────

async def analyze_note(db: AsyncSession, note: SessionNote, *, practitioner_id) -> dict:
    """One approved note, added to the suggestion list and the case summary.

    Two model calls. The first is the monitoring extractor reading the note; what it finds is folded
    into the suggestion list, marked as from this note. The second says what the note adds to the
    case summary. The note's block in the summary is replaced, so an edited note's summary matches
    what it says now. Either call failing saves nothing. Returns the whole case summary. Commits.
    """
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT

    latest = _latest_formulation(note.patient_id, note.organization_id)
    formulation = (await db.execute(latest)).scalars().first()
    current = formulation.preliminary_report if formulation else None
    # The model is shown the summary without this note's earlier additions, so it does not think
    # they are already covered from somewhere else.
    if current:
        current = session_analysis_service.without_session(current, note.id)

    # The situation names already on the list, so the note's are matched to them (pull request 106).
    known_situations = await insight_service.situation_names(db, note.patient_id)

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    # Both model calls before anything is written, so a failure leaves everything as it was. They
    # do not depend on each other, so they run at the same time.
    try:
        raw_extraction, raw_summary = await asyncio.gather(
            asyncio.to_thread(insight_service.request_extraction, client, EXTRACTION_SYSTEM_PROMPT,
                              insight_service.format_session_note(note, known_situations)),
            asyncio.to_thread(session_analysis_service.request_session_summary, client, current,
                              insight_service.session_note_text(note)),
        )
        extraction = insight_service.parse_model_json(raw_extraction)
        reply = insight_service.parse_model_json(raw_summary)
        if not isinstance(extraction, dict) or not isinstance(reply, dict):
            raise ValueError("the model's answer was not a JSON object")
    except Exception as e:
        logger.exception("session analysis failed for note %s", note.id)
        raise AnalysisFailed("The AI could not analyze this session. Please try again.") from e

    await insight_service.suggest_from_session_note(db, note, extraction)
    # Merged into the summary as it is now, not as it was before the model calls, so a monitoring
    # analysis or another session saved meanwhile is not lost.
    formulation = (await db.execute(
        latest.with_for_update().execution_options(populate_existing=True)
    )).scalars().first()
    base = formulation.preliminary_report if formulation else None
    if base:
        base = session_analysis_service.without_session(base, note.id)
    report = session_analysis_service.merge_session(
        base, note_id=note.id, session_date=note.session_date, reply=reply,
    )
    if formulation is None:
        db.add(ClinicalFormulation(
            patient_id=note.patient_id,
            organization_id=note.organization_id,
            practitioner_id=practitioner_id,
            preliminary_report=report,
        ))
    else:
        formulation.preliminary_report = report
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise AnalysisConflict() from e
    return report


async def changed_at(db: AsyncSession, patient_id, organization_id) -> Optional[str]:
    """When an analysis last wrote the summary: the latest of the monitoring run and each session's.

    Read from the summary itself rather than the row's updated_at, which the clinician's own
    formulation draft also moves."""
    formulation = (await db.execute(_latest_formulation(patient_id, organization_id))).scalars().first()
    report = (formulation.preliminary_report or {}) if formulation else {}
    stamps = [report.get("generated_at")] + [a.get("analyzed_at") for a in report.get("session_additions") or []]
    stamps = [s for s in stamps if s]
    return max(stamps, key=datetime.fromisoformat) if stamps else None


def note_is_ready(note: SessionNote) -> bool:
    """Approved and not empty. A draft is still software's guess at the session."""
    return not note.is_draft and bool((note.content or "").strip())


async def notes_needing_analysis(db: AsyncSession, patient_id, organization_id) -> list[SessionNote]:
    """Approved notes that are not in the summary yet, or were changed after they were analyzed."""
    formulation = (await db.execute(_latest_formulation(patient_id, organization_id))).scalars().first()
    analyzed = {
        a.get("session_note_id"): a.get("analyzed_at")
        for a in ((formulation.preliminary_report or {}).get("session_additions") or [] if formulation else [])
    }
    notes = (await db.execute(
        select(SessionNote).where(
            SessionNote.patient_id == patient_id,
            SessionNote.organization_id == organization_id,
        ).order_by(SessionNote.session_date.asc())
    )).scalars().all()
    out = []
    for n in notes:
        if not note_is_ready(n):
            continue
        at = analyzed.get(str(n.id))
        if at is None or (n.updated_at and n.updated_at > datetime.fromisoformat(at)):
            out.append(n)
    return out


# ── Running on its own ───────────────────────────────────────────────────────
# Held in this process's memory. Railway runs one server process, so this is every run there is.

_busy: set[uuid.UUID] = set()
_waiting: dict[uuid.UUID, dict] = {}
_locks: dict[uuid.UUID, asyncio.Lock] = {}


def patient_lock(patient_id: uuid.UUID) -> asyncio.Lock:
    """Held while one patient's summary is being written, by AI Refresh or a run in the background,
    so the two never rebuild the suggestion list at the same time."""
    return _locks.setdefault(patient_id, asyncio.Lock())


# A request whose run never started (the server restarted first) stops counting as "updating"
# after this long, so the page does not say so for ever. AI Refresh does the work then.
_STALE_SECONDS = 600


def is_updating(patient_id: uuid.UUID) -> bool:
    lock = _locks.get(patient_id)
    if patient_id in _busy or (lock is not None and lock.locked()):
        return True
    work = _waiting.get(patient_id)
    return work is not None and time.monotonic() - work["since"] < _STALE_SECONDS


def request(patient_id: uuid.UUID, *, monitoring: bool = False, note_id: Optional[uuid.UUID] = None) -> None:
    """Note that this patient's summary needs updating. Recorded before the response goes, so the
    page sees "updating" as soon as the save comes back."""
    work = _waiting.setdefault(patient_id, {"monitoring": False, "notes": [], "since": time.monotonic()})
    work["monitoring"] = work["monitoring"] or monitoring
    if note_id is not None and note_id not in work["notes"]:
        work["notes"].append(note_id)


def schedule(background, sessions, patient_id: uuid.UUID, **work) -> None:
    """From a route: record the request now, and do it after the response."""
    request(patient_id, **work)
    background.add_task(drain, sessions, patient_id)


async def run_in_background(sessions, patient_id: uuid.UUID, **work) -> None:
    """From work already running after a response: record the request and do it."""
    request(patient_id, **work)
    await drain(sessions, patient_id)


async def drain(sessions, patient_id: uuid.UUID) -> None:
    """Do what is waiting for this patient, now or straight after the run in progress.

    `sessions` opens a session of its own: the request's is closed by the time this runs.
    """
    if not settings.ANTHROPIC_API_KEY:
        # No AI on this machine (a laptop or a test without one): nothing can run. AI Refresh says why.
        _waiting.pop(patient_id, None)
        return
    if patient_id in _busy:
        return  # The run in progress picks it up when it finishes.
    _busy.add(patient_id)
    try:
        while (work := _waiting.pop(patient_id, None)) is not None:
            async with patient_lock(patient_id), sessions() as db:
                if work["monitoring"]:
                    await _monitoring_job(db, patient_id)
                for nid in work["notes"]:
                    await _note_job(db, nid)
    finally:
        _busy.discard(patient_id)


async def _monitoring_job(db: AsyncSession, patient_id: uuid.UUID) -> None:
    try:
        patient = await db.get(PatientProfile, patient_id)
        if patient is None:
            return
        if await count_entries(db, patient_id, patient.organization_id) < MIN_MONITORING_ENTRIES:
            return
        # Only used when the patient has no summary row yet: the row has to name a clinician.
        existing = (await db.execute(
            _latest_formulation(patient_id, patient.organization_id)
        )).scalars().first()
        practitioner_id = existing.practitioner_id if existing else patient.primary_practitioner_id
        if practitioner_id is None:
            logger.warning("case summary refresh skipped: patient %s has no clinician", patient_id)
            return
        await refresh_from_monitoring(
            db, patient_id=patient_id, organization_id=patient.organization_id,
            practitioner_id=practitioner_id,
        )
    except Exception as e:
        # The kind of failure only, never what the parent wrote.
        logger.warning("case summary refresh failed for patient %s: %s", patient_id, type(e).__name__)
        await db.rollback()


async def _note_job(db: AsyncSession, note_id: uuid.UUID) -> None:
    try:
        note = (await db.execute(
            select(SessionNote).where(SessionNote.id == note_id).execution_options(populate_existing=True)
        )).scalar_one_or_none()
        # Deleted, or made empty, since it was asked for.
        if note is None or not note_is_ready(note):
            return
        await analyze_note(db, note, practitioner_id=note.practitioner_id)
    except Exception as e:
        logger.warning("session analysis failed for note %s: %s", note_id, type(e).__name__)
        await db.rollback()
