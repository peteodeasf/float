"""The one saved list per patient, and what survives when the log is analysed again.

The whole point of the table is that a clinician's decisions outlive the next press of the button.
These tests are about that, not about the model.
"""
import uuid
from datetime import datetime, timezone

import pytest

from app.models.insight import KIND_ACCOMMODATION, KIND_BEHAVIOR, KIND_SITUATION
from app.services.insight_service import (
    get_insights, normalise_name, rebuild_from_monitoring,
)

from tests.factories import make_org, make_patient


EXTRACTION = {
    "situations": [
        {
            "name": "Ordering lunch in the cafeteria",
            "fear_rating": 7,
            "behaviors": [{"type": "avoidance", "description": "Eats in the car instead"}],
            "accommodations": [{"description": "Mum orders for him"}],
        },
    ]
}


async def _build(db, patient, org, extraction=EXTRACTION, entry_ids=None):
    return await rebuild_from_monitoring(
        db,
        patient_id=patient.id,
        organization_id=org.id,
        extraction=extraction,
        entry_ids_by_situation=entry_ids if entry_ids is not None else {
            normalise_name("Ordering lunch in the cafeteria"): [uuid.uuid4(), uuid.uuid4()],
        },
    )


async def test_the_list_is_built_with_its_evidence(db):
    org = await make_org(db)
    patient = await make_patient(db, org)

    await _build(db, patient, org)
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)

    by_kind = {r.kind: r for r in rows}
    assert by_kind[KIND_SITUATION].name == "Ordering lunch in the cafeteria"
    assert float(by_kind[KIND_SITUATION].fear_rating) == 7
    # The evidence is the whole point — it was never stored before.
    assert len(by_kind[KIND_SITUATION].monitoring_entry_ids) == 2
    assert by_kind[KIND_BEHAVIOR].attributes["behavior_type"] == "avoidance"
    assert by_kind[KIND_ACCOMMODATION].name == "Mum orders for him"
    # A behaviour belongs to its situation.
    assert by_kind[KIND_BEHAVIOR].parent_insight_id == by_kind[KIND_SITUATION].id


async def test_analysing_again_does_not_duplicate(db):
    """The parent keeps logging, so the button gets pressed again. Press two returns everything
    press one returned."""
    org = await make_org(db)
    patient = await make_patient(db, org)

    await _build(db, patient, org)
    first = await get_insights(db, patient_id=patient.id, organization_id=org.id)

    # Same situation, worded slightly differently, and one new entry behind it.
    again = {
        "situations": [{
            "name": "  ORDERING lunch in the Cafeteria. ",
            "fear_rating": 8,
            "behaviors": [{"type": "avoidance", "description": "Eats in the car instead"}],
            "accommodations": [{"description": "Mum orders for him"}],
        }]
    }
    await _build(db, patient, org, again, {
        normalise_name("Ordering lunch in the cafeteria"): [uuid.uuid4()],
    })
    second = await get_insights(db, patient_id=patient.id, organization_id=org.id)

    assert len(second) == len(first) == 3
    situation = next(r for r in second if r.kind == KIND_SITUATION)
    assert float(situation.fear_rating) == 8
    assert len(situation.monitoring_entry_ids) == 3


async def test_something_the_clinician_removed_stays_removed(db):
    """Otherwise they take the same item off the list every week."""
    org = await make_org(db)
    patient = await make_patient(db, org)

    await _build(db, patient, org)
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    situation = next(r for r in rows if r.kind == KIND_SITUATION)
    situation.removed_at = datetime.now(timezone.utc)
    await db.flush()

    await _build(db, patient, org)

    visible = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    assert all(r.kind != KIND_SITUATION for r in visible)
    everything = await get_insights(
        db, patient_id=patient.id, organization_id=org.id, include_removed=True
    )
    assert any(r.kind == KIND_SITUATION and r.removed_at is not None for r in everything)


async def test_wording_a_clinician_changed_is_not_overwritten(db):
    org = await make_org(db)
    patient = await make_patient(db, org)

    await _build(db, patient, org)
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    situation = next(r for r in rows if r.kind == KIND_SITUATION)
    situation.name = "Buying lunch at school"
    situation.is_edited = True
    await db.flush()

    await _build(db, patient, org)

    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    situation = next(r for r in rows if r.kind == KIND_SITUATION)
    assert situation.name == "Buying lunch at school"


async def test_an_item_on_the_plan_keeps_its_link(db):
    """Adding to the plan is what makes an item real. Analysing again must not undo it."""
    from tests.factories import make_plan, make_situation

    org = await make_org(db)
    plan = await make_plan(db, org)
    patient = plan.patient
    trigger = await make_situation(db, plan, name="Ordering lunch in the cafeteria")

    await _build(db, patient, org)
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    item = next(r for r in rows if r.kind == KIND_SITUATION)
    item.trigger_situation_id = trigger.id
    item.added_at = datetime.now(timezone.utc)
    await db.flush()

    await _build(db, patient, org)

    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    item = next(r for r in rows if r.kind == KIND_SITUATION)
    assert item.trigger_situation_id == trigger.id
    assert item.added_at is not None


async def test_deleting_the_plan_row_frees_the_item(db):
    """A situation deleted from the ladder should not leave an item claiming it was added."""
    from sqlalchemy import delete
    from app.models.treatment import TriggerSituation
    from tests.factories import make_plan, make_situation

    org = await make_org(db)
    plan = await make_plan(db, org)
    patient = plan.patient
    trigger = await make_situation(db, plan, name="Ordering lunch in the cafeteria")

    await _build(db, patient, org)
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    item = next(r for r in rows if r.kind == KIND_SITUATION)
    item.trigger_situation_id = trigger.id
    await db.flush()

    await db.execute(delete(TriggerSituation).where(TriggerSituation.id == trigger.id))
    await db.flush()
    await db.refresh(item)

    assert item.trigger_situation_id is None


async def test_a_blank_name_is_not_a_row(db):
    org = await make_org(db)
    patient = await make_patient(db, org)

    await _build(db, patient, org, {"situations": [{"name": "   ", "behaviors": [], "accommodations": []}]}, {})

    assert await get_insights(db, patient_id=patient.id, organization_id=org.id) == []


# ── The endpoint ──────────────────────────────────────────────────────────────

async def test_analyze_with_ai_builds_the_list_then_writes_the_report(api, db, monkeypatch):
    """Two calls in order: the list, then the report written from it.

    Both models are stubbed. This is about the wiring — that the list is built and saved before the
    report is written, and that the report sees the list rather than only the raw log.
    """
    from datetime import date

    from app.models.monitoring import MonitoringEntry, MonitoringForm
    from tests.factories import grant_patient_to, make_plan, make_practitioner

    org = await make_org(db)
    plan = await make_plan(db, org)
    patient = plan.patient
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)

    form = MonitoringForm(
        patient_id=patient.id, organization_id=org.id, access_token=str(uuid.uuid4()),
    )
    db.add(form)
    await db.flush()
    db.add(MonitoringEntry(
        monitoring_form_id=form.id, entry_date=date(2026, 3, 14),
        situation="Lunch at school", child_behavior_observed="Froze at the counter",
        parent_response="I ordered for him", fear_thermometer=8, is_draft=False,
    ))
    await db.flush()

    sent = []

    class FakeMessages:
        def create(self, **kwargs):
            sent.append(kwargs)
            body = (
                '{"situations":[{"name":"Ordering lunch in the cafeteria","fear_rating":7,'
                '"behaviors":[{"type":"avoidance","description":"Eats in the car instead"}],'
                '"accommodations":[{"description":"Mum orders for him"}],"entries":[1]}]}'
                if len(sent) == 1 else '{"summary":"ok"}'
            )
            return type("M", (), {"content": [type("T", (), {"text": body})()]})()

    class FakeClient:
        def __init__(self, **kwargs):
            self.messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", FakeClient)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")
    assert r.status_code == 200, r.text

    # The list was built, with the entry the model pointed at.
    rows = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    situation = next(r for r in rows if r.kind == KIND_SITUATION)
    assert situation.name == "Ordering lunch in the cafeteria"
    assert len(situation.monitoring_entry_ids) == 1

    # Two calls, in order, and the report saw the list.
    assert len(sent) == 2
    report_input = sent[1]["messages"][0]["content"]
    assert "Ordering lunch in the cafeteria" in report_input
    assert "What an adult does: Mum orders for him" in report_input


async def test_an_entry_number_the_model_invented_is_dropped(db):
    """The model is pointing at a list we handed it. A number outside that list is a mistake, not
    new information, and must never become evidence."""
    from app.services.insight_service import entry_ids_by_situation

    real = uuid.uuid4()
    got = entry_ids_by_situation(
        {"situations": [{"name": "Lunch", "entries": [1, 99, "x", None, 1]}]},
        {1: real},
    )
    assert got == {"lunch": [real]}
