"""Analyze session with AI: one approved session note, added to the suggestion list and the case
summary.

Peter, 2026-10-21 (docs/backlog.md, "Analyze session with AI: add a session to the case summary"):
one clinician-started action, nothing on approval; update the case summary, never overwrite it.
docs/plans/session-suggestions.md has the suggestion-list choices. These tests never reach the
model, so they say nothing about the quality of what it adds.
"""
import json
import uuid
from datetime import date

from sqlalchemy import select

from app.models.formulation import ClinicalFormulation
from app.models.insight import KIND_BEHAVIOR, KIND_SITUATION, SOURCE_SESSION_NOTE
from app.models.session_note import SessionNote
from app.services import insight_service, session_analysis_service
from app.services.insight_service import get_insights, upsert_insight

from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner

REAL_REQUEST_EXTRACTION = insight_service.request_extraction

EXTRACTION = {"situations": [{
    "name": "Answering a question in class", "fear_rating": 7, "entries": [1],
    "behaviors": [{"type": "safety", "description": "Sits at the back so the teacher won't call on her"}],
    "accommodations": [],
}]}

SUMMARY_REPLY = {
    "situations": [{"name": "Answering a question in class", "fear_thermometer": 7}],
    "parental_responses": ["Emails the teacher asking that she not be called on"],
    "safety_behaviors": ["Sits at the back of the class"],
    "comments": [{"about": "Bedtime / sleeping alone", "note": "Sleeping alone went well all week."}],
    "notes": ["Wants to try answering one question next week."],
}

# A case summary from monitoring analysis, as the monitoring route saves it.
MONITORING_REPORT = {
    "situations": [{"name": "Bedtime / sleeping alone", "fear_thermometer": 6}],
    "parental_responses": ["Lets her sleep in the parents' room"],
    "safety_behaviors": ["Asks a parent to stay until she falls asleep"],
    "safety_section_label": "Safety & avoidance behaviors",
    "treatment_targets": ["Bedtime / sleeping alone"],
    "generated_at": "2026-10-14T12:00:00+00:00",
}


async def _setup(db, monkeypatch, *, draft=False, extraction=None, summary=None, report=None):
    calls = {"extraction": [], "summary": []}

    def fake_extraction(client, system, text):
        calls["extraction"].append(text)
        if isinstance(extraction, Exception):
            raise extraction
        return json.dumps(extraction if extraction is not None else EXTRACTION)

    def fake_summary(client, current, note_text):
        calls["summary"].append((current, note_text))
        if isinstance(summary, Exception):
            raise summary
        return json.dumps(summary if summary is not None else SUMMARY_REPLY)

    monkeypatch.setattr(insight_service, "request_extraction", fake_extraction)
    monkeypatch.setattr(session_analysis_service, "request_session_summary", fake_summary)
    from app.core import config
    monkeypatch.setattr(config.settings, "ANTHROPIC_API_KEY", "test")

    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    note = SessionNote(
        patient_id=patient.id, organization_id=org.id, practitioner_id=clinician.id,
        session_date=date(2026, 10, 15), tags=[], is_draft=draft,
        content="Situations and exposures\nAnswering a question in class, Fear Level 7. She sits at the back.",
    )
    db.add(note)
    if report is not None:
        db.add(ClinicalFormulation(patient_id=patient.id, organization_id=org.id,
                                   practitioner_id=clinician.id, preliminary_report=report))
    await db.flush()
    return org, patient, clinician, note, calls


async def _saved_report(db, patient):
    rows = (await db.execute(
        select(ClinicalFormulation).where(ClinicalFormulation.patient_id == patient.id)
        .execution_options(populate_existing=True)
    )).scalars().all()
    assert len(rows) == 1
    return rows[0].preliminary_report


# ── Only on an approved note, only when pressed ──────────────────────────────

async def test_a_draft_note_is_refused(api, db, monkeypatch):
    # The button works on an approved note only: a draft is still software's guess at the session.
    _, patient, clinician, note, calls = await _setup(db, monkeypatch, draft=True)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code == 409
    assert calls == {"extraction": [], "summary": []}


async def test_approving_a_note_reads_nothing(api, db, monkeypatch):
    # The automatic run on approval was removed (Peter: "We shouldn't have both"). Approving must not
    # call the model at all.
    org, patient, clinician, note, calls = await _setup(db, monkeypatch, draft=True)
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"is_draft": False})

    assert r.status_code == 200, r.text
    assert r.json()["is_draft"] is False
    assert calls == {"extraction": [], "summary": []}
    assert await get_insights(db, patient_id=patient.id, organization_id=org.id) == []


async def test_another_clinicians_note_is_refused(api, db, monkeypatch):
    # A session note is a patient's record. A clinician without access to the patient gets nothing
    # and nothing is analyzed.
    org, _, _, note, calls = await _setup(db, monkeypatch)
    stranger = await make_practitioner(db, org, name="Other Clinician")
    api.sign_in_as(stranger.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code in (403, 404)
    assert calls == {"extraction": [], "summary": []}


# ── The suggestion list ───────────────────────────────────────────────────────

async def test_analyzing_adds_the_notes_suggestions_marked_with_the_session(api, db, monkeypatch):
    # One press adds the session's situations and behaviors to the suggestion list, marked as from
    # that note, using the monitoring extractor told it is reading a session note.
    org, patient, clinician, note, calls = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code == 200, r.text
    assert len(calls["extraction"]) == 1
    assert "clinician's session note" in calls["extraction"][0]
    items = {i.kind: i for i in await get_insights(db, patient_id=patient.id, organization_id=org.id)}
    situation = items[KIND_SITUATION]
    assert situation.name == "Answering a question in class"
    assert float(situation.fear_rating) == 7
    assert situation.sources == [SOURCE_SESSION_NOTE]
    assert situation.session_note_ids == [note.id]
    assert items[KIND_BEHAVIOR].attributes["behavior_type"] == "safety"
    assert all(i.trigger_situation_id is None and i.avoidance_behavior_id is None for i in items.values())


async def test_a_session_fear_level_does_not_replace_the_logs(api, db, monkeypatch):
    # Kept from the on-approval version. Peter to confirm: the log's number stands; the session's
    # only fills a gap.
    org, patient, clinician, note, _ = await _setup(db, monkeypatch)
    await upsert_insight(db, patient_id=patient.id, organization_id=org.id, kind=KIND_SITUATION,
                         name="Answering a question in class", fear_rating=4)
    await db.flush()
    api.sign_in_as(clinician.user)

    await api.post(f"/notes/{note.id}/analyze")

    situation = next(i for i in await get_insights(db, patient_id=patient.id, organization_id=org.id)
                     if i.kind == KIND_SITUATION)
    assert float(situation.fear_rating) == 4
    assert SOURCE_SESSION_NOTE in situation.sources


async def test_a_behaviour_from_a_session_does_not_borrow_the_logs_evidence(api, db, monkeypatch):
    # Kept from the on-approval version: the evidence for a session's behavior is the note, not the
    # log entries behind the situation it sits under.
    org, patient, clinician, note, _ = await _setup(db, monkeypatch)
    await upsert_insight(db, patient_id=patient.id, organization_id=org.id, kind=KIND_SITUATION,
                         name="Answering a question in class", monitoring_entry_ids=[uuid.uuid4()])
    await db.flush()
    api.sign_in_as(clinician.user)

    await api.post(f"/notes/{note.id}/analyze")

    behaviour = next(i for i in await get_insights(db, patient_id=patient.id, organization_id=org.id)
                     if i.kind == KIND_BEHAVIOR)
    assert behaviour.monitoring_entry_ids == []
    assert behaviour.session_note_ids == [note.id]


# ── The case summary ──────────────────────────────────────────────────────────

async def test_existing_summary_items_survive_a_session_analysis(api, db, monkeypatch):
    # Update, never overwrite. Every item monitoring put in the summary is still there, word for
    # word, and a comment against one does not remove it.
    _, patient, clinician, note, calls = await _setup(db, monkeypatch, report=MONITORING_REPORT)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code == 200, r.text
    saved = await _saved_report(db, patient)
    for key, value in MONITORING_REPORT.items():
        assert saved[key] == value
    assert r.json() == saved
    # The model was shown the current summary, so it can avoid repeating it.
    assert "Bedtime / sleeping alone" in session_analysis_service.summary_as_text(calls["summary"][0][0])


async def test_session_items_are_marked_with_their_session(api, db, monkeypatch):
    # Each addition carries the note it came from and the session date, so the Case Summary can say
    # "from session, Oct 15".
    _, patient, clinician, note, _ = await _setup(db, monkeypatch, report=MONITORING_REPORT)
    api.sign_in_as(clinician.user)

    await api.post(f"/notes/{note.id}/analyze")

    [block] = (await _saved_report(db, patient))["session_additions"]
    assert block["session_note_id"] == str(note.id)
    assert block["session_date"] == "2026-10-15"
    assert block["analyzed_at"]
    assert block["situations"] == [{"name": "Answering a question in class", "fear_thermometer": 7.0}]
    assert block["parental_responses"] == SUMMARY_REPLY["parental_responses"]
    assert block["safety_behaviors"] == SUMMARY_REPLY["safety_behaviors"]
    assert block["comments"] == SUMMARY_REPLY["comments"]
    assert block["notes"] == SUMMARY_REPLY["notes"]


async def test_a_session_can_be_analyzed_before_monitoring(api, db, monkeypatch):
    # No case summary yet: the session's additions start one, with empty monitoring sections and no
    # "generated" time, so the page still knows monitoring has not been analyzed.
    _, patient, clinician, note, _ = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code == 200, r.text
    saved = await _saved_report(db, patient)
    assert saved["situations"] == [] and "generated_at" not in saved
    assert len(saved["session_additions"]) == 1


async def test_analyzing_the_same_note_twice_adds_nothing_new(api, db, monkeypatch):
    # The model gives the same answer the second time. Nothing in the summary or the suggestion list
    # is doubled, and the note still has one block.
    org, patient, clinician, note, calls = await _setup(db, monkeypatch, report=MONITORING_REPORT)
    api.sign_in_as(clinician.user)

    await api.post(f"/notes/{note.id}/analyze")
    first = await _saved_report(db, patient)
    first_items = len(await get_insights(db, patient_id=patient.id, organization_id=org.id))
    await api.post(f"/notes/{note.id}/analyze")
    second = await _saved_report(db, patient)

    assert len(calls["summary"]) == 2
    first_block, = first["session_additions"]
    second_block, = second["session_additions"]
    for key in ("situations", "parental_responses", "safety_behaviors", "comments", "notes"):
        assert second_block[key] == first_block[key]
    assert len(await get_insights(db, patient_id=patient.id, organization_id=org.id)) == first_items


async def test_an_item_already_in_the_monitoring_summary_is_not_added_again(api, db, monkeypatch):
    # The model is told not to repeat the summary, but if it does, the same wording is skipped.
    _, patient, clinician, note, _ = await _setup(
        db, monkeypatch, report=MONITORING_REPORT,
        summary={"parental_responses": ["Lets her sleep in the parents' room."]},
    )
    api.sign_in_as(clinician.user)

    await api.post(f"/notes/{note.id}/analyze")

    [block] = (await _saved_report(db, patient))["session_additions"]
    assert block["parental_responses"] == []


async def test_a_model_failure_saves_nothing(api, db, monkeypatch):
    # Either call failing leaves the suggestion list and the summary as they were, with a plain error.
    org, patient, clinician, note, _ = await _setup(
        db, monkeypatch, report=MONITORING_REPORT, summary=RuntimeError("down"),
    )
    api.sign_in_as(clinician.user)

    r = await api.post(f"/notes/{note.id}/analyze")

    assert r.status_code == 500
    assert "could not analyze" in r.json()["detail"]
    assert await get_insights(db, patient_id=patient.id, organization_id=org.id) == []
    assert "session_additions" not in await _saved_report(db, patient)


async def test_monitoring_reanalysis_keeps_the_session_additions(api, db, monkeypatch):
    # "Re-analyze with AI" on the Monitoring side rewrites the monitoring sections. It must carry
    # the session additions across, and must not feed session-only items into the monitoring report
    # as if the parent had logged them.
    from app.models.monitoring import MonitoringEntry, MonitoringForm

    _, patient, clinician, note, _ = await _setup(db, monkeypatch, report=MONITORING_REPORT)
    api.sign_in_as(clinician.user)
    await api.post(f"/notes/{note.id}/analyze")
    additions = (await _saved_report(db, patient))["session_additions"]

    form = MonitoringForm(patient_id=patient.id, organization_id=note.organization_id,
                          access_token=str(uuid.uuid4()))
    db.add(form)
    await db.flush()
    db.add(MonitoringEntry(
        monitoring_form_id=form.id, entry_date=date(2026, 10, 10), situation="Bedtime",
        child_behavior_observed="Asked me to stay", parent_response="I stayed",
        fear_thermometer=6, is_draft=False,
    ))
    await db.flush()

    sent = []

    class FakeMessages:
        def create(self, **kwargs):
            sent.append(kwargs)
            body = (
                '{"situations":[{"name":"Bedtime","fear_rating":6,"behaviors":[],'
                '"accommodations":[{"description":"Parent stays until asleep"}],"entries":[1]}]}'
                if len(sent) == 1 else
                '{"situations":[{"name":"Bedtime","fear_thermometer":6}],"parental_responses":["Stays"],'
                '"safety_behaviors":[],"safety_section_label":"Safety & avoidance behaviors",'
                '"treatment_targets":["Bedtime"]}'
            )
            return type("M", (), {"content": [type("T", (), {"text": body})()]})()

    class FakeClient:
        def __init__(self, **kwargs):
            self.messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", FakeClient)
    monkeypatch.setattr(insight_service, "request_extraction", REAL_REQUEST_EXTRACTION)

    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")

    assert r.status_code == 200, r.text
    saved = await _saved_report(db, patient)
    assert saved["parental_responses"] == ["Stays"]
    assert saved["session_additions"] == additions
    report_input = sent[1]["messages"][0]["content"]
    assert "Bedtime" in report_input
    assert "Answering a question in class" not in report_input


async def test_deleting_a_note_takes_its_additions_out_of_the_summary(api, db, monkeypatch):
    # A note deleted because it was on the wrong patient must not leave its content in this
    # patient's Case Summary. Monitoring's part is untouched.
    _, patient, clinician, note, _ = await _setup(db, monkeypatch, report=MONITORING_REPORT)
    api.sign_in_as(clinician.user)
    await api.post(f"/notes/{note.id}/analyze")

    r = await api.delete(f"/notes/{note.id}")

    assert r.status_code == 204, r.text
    saved = await _saved_report(db, patient)
    assert saved["session_additions"] == []
    assert saved["situations"] == MONITORING_REPORT["situations"]


def test_a_comment_copying_the_fear_number_still_names_its_item():
    # The model is shown "Bedtime / sleeping alone (fear thermometer 6)" and sometimes copies the
    # number into "about"; the comment would then match no item on the Case Summary.
    out = session_analysis_service.merge_session(
        MONITORING_REPORT, note_id=uuid.uuid4(), session_date=date(2026, 10, 15),
        reply={"comments": [{"about": "Bedtime / sleeping alone (fear thermometer 6)", "note": "Better."}]},
    )
    assert out["session_additions"][0]["comments"] == [{"about": "Bedtime / sleeping alone", "note": "Better."}]
