"""What the AI proposed and what the clinician did with it. docs/plans/ai-foundation-and-features.md

These tests never reach the model.
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.models import ai_suggestion as ai
from app.models.ai_suggestion import AiSuggestion
from app.models.session_note import SessionNote
from app.services import ai_record, combination_wording

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)


async def _setup(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    situation = await make_situation(db, plan, name="Participating in class verbally", dt=6)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician, owner=True)
    return org, plan.patient, situation, clinician


async def _rows(db, patient_id, job):
    return (await db.execute(
        select(AiSuggestion).where(AiSuggestion.patient_id == patient_id, AiSuggestion.job == job)
        .order_by(AiSuggestion.created_at).execution_options(populate_existing=True)
    )).scalars().all()


@pytest.fixture
def ai_wording(monkeypatch):
    monkeypatch.setattr(combination_wording.settings, "ANTHROPIC_API_KEY", "test")

    async def fake(situation, behavior, client=None, system=None):
        return "Raise your hand in class without sitting at the back"
    monkeypatch.setattr(combination_wording, "ask_claude", fake)


# ── The step sentence ─────────────────────────────────────────────────────────

async def _draft_then_save(api, db, name):
    org, patient, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    draft = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")
    assert draft.json()["drafted_by"] == "ai"
    saved = await api.post(f"/triggers/{situation.id}/behaviors", json={
        "name": name, "behavior_type": "combination", "without_behavior_id": str(safety.id),
    })
    assert saved.status_code == 201, saved.text
    return patient, clinician


async def test_a_step_sentence_kept_as_drafted_is_accepted(api, db, ai_wording):
    patient, clinician = await _draft_then_save(api, db, "Raise your hand in class without sitting at the back")

    row, = await _rows(db, patient.id, ai.STEP_SENTENCE)
    assert row.status == ai.ACCEPTED and row.final is None
    assert row.decided_by_user_id == clinician.user.id


async def test_a_step_sentence_reworded_is_edited_with_the_final_wording(api, db, ai_wording):
    patient, _ = await _draft_then_save(api, db, "Answer one question from the front row")

    row, = await _rows(db, patient.id, ai.STEP_SENTENCE)
    assert row.status == ai.EDITED
    assert row.final == {"sentence": "Answer one question from the front row"}


async def test_a_second_draft_replaces_the_first(api, db, ai_wording):
    org, patient, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    for _ in range(2):
        await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    first, second = await _rows(db, patient.id, ai.STEP_SENTENCE)
    assert (first.status, second.status) == (ai.REPLACED, ai.PENDING)


async def test_the_template_is_not_recorded_as_ai(api, db, monkeypatch):
    # Without the AI, Float's own fallback wording is used. That is not the AI's, so not recorded.
    monkeypatch.setattr(combination_wording.settings, "ANTHROPIC_API_KEY", "")
    org, patient, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)

    await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    assert await _rows(db, patient.id, ai.STEP_SENTENCE) == []


# ── The session note drafted from a recording ────────────────────────────────

async def _drafted_note(db, patient, clinician, content="Sarah did two exposures this week."):
    note = SessionNote(patient_id=patient.id, organization_id=patient.organization_id,
                       practitioner_id=clinician.id, session_date=date(2026, 11, 18), tags=[],
                       is_draft=True, content=content, source="recording")
    db.add(note)
    await db.flush()
    await ai_record.record(
        db, patient_id=patient.id, organization_id=patient.organization_id, job=ai.SESSION_NOTE_DRAFT,
        model="test", prompt="test", output={"content": content}, source={"session_note_id": str(note.id)},
    )
    return note


async def test_approving_a_draft_note_unchanged_is_accepted(api, db):
    org, patient, _, clinician = await _setup(db)
    note = await _drafted_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    r = await api.put(f"/notes/{note.id}", json={"is_draft": False})

    assert r.status_code == 200, r.text
    row, = await _rows(db, patient.id, ai.SESSION_NOTE_DRAFT)
    assert row.status == ai.ACCEPTED


async def test_approving_an_edited_draft_note_is_edited(api, db):
    org, patient, _, clinician = await _setup(db)
    note = await _drafted_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    await api.put(f"/notes/{note.id}", json={"is_draft": False, "content": "Sarah did three exposures."})

    row, = await _rows(db, patient.id, ai.SESSION_NOTE_DRAFT)
    assert row.status == ai.EDITED and row.final == {"content": "Sarah did three exposures."}


async def test_deleting_a_draft_note_rejects_it(api, db):
    org, patient, _, clinician = await _setup(db)
    note = await _drafted_note(db, patient, clinician)
    api.sign_in_as(clinician.user)

    r = await api.delete(f"/notes/{note.id}")

    assert r.status_code == 204, r.text
    row, = await _rows(db, patient.id, ai.SESSION_NOTE_DRAFT)
    assert row.status == ai.REJECTED and row.decided_by_user_id == clinician.user.id
