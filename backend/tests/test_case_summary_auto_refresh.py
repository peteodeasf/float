"""The case summary updates on its own. docs/plans/case-summary-auto-refresh.md

Peter, 2026-11-18: when a monitoring entry comes in or a session note is added, the case summary
updates without anyone pressing a button, after every single entry. These tests never reach the
model, so they say nothing about the quality of what it writes.
"""
import asyncio
import json
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.models.formulation import ClinicalFormulation
from app.models.monitoring import MonitoringEntry, MonitoringForm
from app.models.session_note import SessionNote
from app.services import case_summary_service, insight_service, session_analysis_service

from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner

EXTRACTION = {"situations": [{
    "name": "Bedtime", "fear_rating": 6, "entries": [1], "behaviors": [], "accommodations": [],
}]}
REPORT = {
    "situations": [{"name": "Bedtime", "fear_thermometer": 6}], "parental_responses": ["Stays"],
    "safety_behaviors": [], "safety_section_label": "Safety & avoidance behaviors",
    "treatment_targets": ["Bedtime"],
}
SUMMARY_REPLY = {"situations": [], "parental_responses": [], "safety_behaviors": [], "comments": [],
                 "notes": ["Wants to try answering one question next week."]}


async def _setup(db, monkeypatch, *, entries=0, summary=None):
    calls = {"extraction": 0, "report": 0, "summary": 0}

    def fake_extraction(client, system, text):
        calls["extraction"] += 1
        return json.dumps(EXTRACTION)

    def fake_report(client, system, insights, entries_text):
        calls["report"] += 1
        return json.dumps(REPORT)

    def fake_summary(client, current, note_text):
        calls["summary"] += 1
        return json.dumps(summary if summary is not None else SUMMARY_REPLY)

    monkeypatch.setattr(insight_service, "request_extraction", fake_extraction)
    monkeypatch.setattr(insight_service, "request_report", fake_report)
    monkeypatch.setattr(session_analysis_service, "request_session_summary", fake_summary)
    from app.core import config
    monkeypatch.setattr(config.settings, "ANTHROPIC_API_KEY", "test")

    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await make_practitioner(db, org)
    patient.primary_practitioner_id = clinician.id
    await grant_patient_to(db, patient, clinician, owner=True)
    form = MonitoringForm(patient_id=patient.id, organization_id=org.id, status="in_progress",
                          access_token=secrets.token_hex(32), sent_at=datetime.now(timezone.utc))
    db.add(form)
    await db.flush()
    for i in range(entries):
        db.add(MonitoringEntry(monitoring_form_id=form.id, entry_date=date(2026, 10, 1 + i),
                               situation="Bedtime", fear_thermometer=6, is_draft=False))
    await db.flush()
    return org, patient, clinician, form, calls


async def _report(db, patient):
    row = (await db.execute(
        select(ClinicalFormulation).where(ClinicalFormulation.patient_id == patient.id)
        .execution_options(populate_existing=True)
    )).scalars().first()
    return row.preliminary_report if row else None


def _entry(api, form):
    return api.post(f"/monitor/{form.access_token}/entries", json={
        "entry_date": "2026-10-20", "situation": "Bedtime", "fear_thermometer": 7,
    })


# ── Monitoring ────────────────────────────────────────────────────────────────

async def test_a_new_entry_refreshes_the_summary(api, db, monkeypatch):
    _, patient, _, form, calls = await _setup(db, monkeypatch, entries=2)

    r = await _entry(api, form)  # the third

    assert r.status_code == 200, r.text
    assert calls["extraction"] == 1 and calls["report"] == 1
    assert (await _report(db, patient))["parental_responses"] == ["Stays"]


async def test_under_three_entries_nothing_runs(api, db, monkeypatch):
    _, patient, _, form, calls = await _setup(db, monkeypatch, entries=1)

    r = await _entry(api, form)  # the second

    assert r.status_code == 200, r.text
    assert calls == {"extraction": 0, "report": 0, "summary": 0}
    assert await _report(db, patient) is None


async def test_a_draft_entry_does_not_refresh(api, db, monkeypatch):
    _, _, _, form, calls = await _setup(db, monkeypatch, entries=3)

    r = await api.post(f"/monitor/{form.access_token}/entries",
                       json={"entry_date": "2026-10-20", "situation": "Bedtime", "is_draft": True})

    assert r.status_code == 200, r.text
    assert calls["extraction"] == 0


async def test_a_refresh_keeps_what_sessions_added(api, db, monkeypatch):
    org, patient, clinician, form, _ = await _setup(db, monkeypatch, entries=2)
    session_block = {"session_note_id": str(uuid.uuid4()), "session_date": "2026-10-15",
                     "analyzed_at": "2026-10-16T00:00:00+00:00", "notes": ["kept"]}
    db.add(ClinicalFormulation(patient_id=patient.id, organization_id=org.id, practitioner_id=clinician.id,
                               preliminary_report={"situations": [], "session_additions": [session_block]}))
    await db.flush()

    await _entry(api, form)

    assert (await _report(db, patient))["session_additions"] == [session_block]


# ── Session notes ─────────────────────────────────────────────────────────────

async def test_a_typed_note_is_added_when_saved(api, db, monkeypatch):
    _, patient, clinician, _, calls = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/notes", json={"content": "Wants to try answering in class."})

    assert r.status_code == 201, r.text
    assert calls["summary"] == 1
    block, = (await _report(db, patient))["session_additions"]
    assert block["session_note_id"] == r.json()["id"]


async def test_an_empty_note_is_not_analyzed(api, db, monkeypatch):
    _, patient, clinician, _, calls = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/notes", json={"content": "   "})

    assert r.status_code == 201, r.text
    assert calls["summary"] == 0


async def _approved_note(db, patient, clinician, content="Answering a question in class, Fear Level 7."):
    note = SessionNote(patient_id=patient.id, organization_id=patient.organization_id,
                       practitioner_id=clinician.id, session_date=date(2026, 10, 15), tags=[],
                       is_draft=False, content=content)
    db.add(note)
    await db.flush()
    return note


async def test_changing_only_the_tags_does_not_analyze(api, db, monkeypatch):
    _, patient, clinician, _, calls = await _setup(db, monkeypatch)
    note = await _approved_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"tags": ["school"]})

    assert r.status_code == 200, r.text
    assert calls["summary"] == 0


async def test_an_edited_note_replaces_its_block(api, db, monkeypatch):
    # A line taken out of the note comes out of the summary: the block is replaced, not added to.
    _, patient, clinician, _, calls = await _setup(db, monkeypatch)
    note = await _approved_note(db, patient, clinician)
    api.sign_in_as(clinician.user)
    await api.post(f"/notes/{note.id}/analyze")
    assert (await _report(db, patient))["session_additions"][0]["notes"] == [SUMMARY_REPLY["notes"][0]]

    monkeypatch.setattr(session_analysis_service, "request_session_summary",
                        lambda client, current, text: json.dumps({**SUMMARY_REPLY, "notes": ["Something else."]}))
    r = await api.put(f"/notes/{note.id}", json={"content": "Something else."})

    assert r.status_code == 200, r.text
    block, = (await _report(db, patient))["session_additions"]
    assert block["notes"] == ["Something else."]


# ── AI Refresh ────────────────────────────────────────────────────────────────

async def test_ai_refresh_also_adds_notes_not_in_the_summary_yet(api, db, monkeypatch):
    # The retry when a run in the background failed: the per-note button is gone.
    _, patient, clinician, _, calls = await _setup(db, monkeypatch, entries=3)
    note = await _approved_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")

    assert r.status_code == 200, r.text
    assert calls["report"] == 1 and calls["summary"] == 1
    assert [a["session_note_id"] for a in r.json()["session_additions"]] == [str(note.id)]


async def test_ai_refresh_with_only_a_note(api, db, monkeypatch):
    _, patient, clinician, _, calls = await _setup(db, monkeypatch)
    await _approved_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")

    assert r.status_code == 200, r.text
    assert calls["report"] == 0 and calls["summary"] == 1


async def test_ai_refresh_with_nothing_to_read(api, db, monkeypatch):
    _, patient, clinician, _, _ = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")

    assert r.status_code == 404


async def test_the_status_route_says_when_it_is_idle(api, db, monkeypatch):
    _, patient, clinician, _, _ = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.get(f"/patients/{patient.id}/case-summary/status")

    assert r.status_code == 200 and r.json() == {"updating": False}


# ── One at a time ─────────────────────────────────────────────────────────────

async def test_what_arrives_during_a_run_is_done_once_after_it(monkeypatch):
    # Two entries saved while one run is going cause exactly one more run, with no timer.
    patient_id = uuid.uuid4()
    runs, release = [], asyncio.Event()

    async def fake_job(db, pid):
        runs.append(pid)
        if len(runs) == 1:
            await release.wait()

    monkeypatch.setattr(case_summary_service, "_monitoring_job", fake_job)
    from app.core import config
    monkeypatch.setattr(config.settings, "ANTHROPIC_API_KEY", "test")

    @asynccontextmanager
    async def sessions():
        yield None

    first = asyncio.create_task(case_summary_service.run_in_background(sessions, patient_id, monitoring=True))
    await asyncio.sleep(0)
    assert case_summary_service.is_updating(patient_id)
    await case_summary_service.run_in_background(sessions, patient_id, monitoring=True)
    await case_summary_service.run_in_background(sessions, patient_id, monitoring=True)
    release.set()
    await first

    assert runs == [patient_id, patient_id]
    assert not case_summary_service.is_updating(patient_id)
