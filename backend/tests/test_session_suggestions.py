"""Suggestions from an approved session note.

Step 5 of docs/plans/ladder-combinations.md; the choices are in docs/plans/session-suggestions.md.
These tests never reach the model.
"""
import json
from datetime import date

from app.models.insight import KIND_BEHAVIOR, KIND_SITUATION, SOURCE_SESSION_NOTE
from app.models.session_note import SessionNote
from app.services import insight_service
from app.services.insight_service import get_insights

from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner

EXTRACTION = {"situations": [{
    "name": "Answering a question in class", "fear_rating": 7, "entries": [1],
    "behaviors": [{"type": "safety", "description": "Sits at the back so the teacher won't call on her"}],
    "accommodations": [],
}]}


async def _setup(db, monkeypatch, *, draft=True, reply=None):
    calls = []

    def fake(client, system, text):
        calls.append(text)
        if isinstance(reply, Exception):
            raise reply
        return json.dumps(reply if reply is not None else EXTRACTION)

    monkeypatch.setattr(insight_service, "request_extraction", fake)
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
    await db.flush()
    return org, patient, clinician, note, calls


async def test_approving_a_draft_note_adds_its_suggestions(api, db, monkeypatch):
    org, patient, clinician, note, calls = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"is_draft": False})

    assert r.status_code == 200, r.text
    assert len(calls) == 1
    assert "clinician's session note" in calls[0]
    items = {i.kind: i for i in await get_insights(db, patient_id=patient.id, organization_id=org.id)}
    situation = items[KIND_SITUATION]
    assert situation.name == "Answering a question in class"
    assert float(situation.fear_rating) == 7
    assert situation.sources == [SOURCE_SESSION_NOTE]
    assert situation.session_note_ids == [note.id]
    assert items[KIND_BEHAVIOR].attributes["behavior_type"] == "safety"


async def test_approving_again_reads_nothing(api, db, monkeypatch):
    _, _, clinician, note, calls = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    await api.put(f"/notes/{note.id}", json={"is_draft": False})
    await api.put(f"/notes/{note.id}", json={"is_draft": False})

    assert len(calls) == 1


async def test_a_note_that_was_never_a_draft_is_not_read(api, db, monkeypatch):
    _, _, clinician, note, calls = await _setup(db, monkeypatch, draft=False)
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"is_draft": False, "content": "Edited."})

    assert r.status_code == 200, r.text
    assert calls == []


async def test_a_model_failure_leaves_the_note_approved_and_the_list_alone(api, db, monkeypatch):
    org, patient, clinician, note, calls = await _setup(db, monkeypatch, reply=RuntimeError("down"))
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"is_draft": False})

    assert r.status_code == 200
    assert r.json()["is_draft"] is False
    assert await get_insights(db, patient_id=patient.id, organization_id=org.id) == []


async def test_nothing_is_put_on_the_plan(api, db, monkeypatch):
    org, patient, clinician, note, _ = await _setup(db, monkeypatch)
    api.sign_in_as(clinician.user)

    await api.put(f"/notes/{note.id}", json={"is_draft": False})

    items = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    assert items and all(
        i.trigger_situation_id is None and i.avoidance_behavior_id is None for i in items
    )
