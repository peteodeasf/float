"""Dr. Walker's exposure worksheet: the setup and debrief answers it added.

Plan: docs/plans/exposure-worksheet-questions.md
"""
import json

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)

ANSWERS = {
    "prediction": "He'll think I'm weird and look away",
    "how_will_i_know": "He looks away straight after",
    "bip_before": 70,
    "distress_thermometer_expected": 6,
    "tempting_behaviors": json.dumps({"safety": ["Looks at the floor"]}),
    "confidence_level": "medium",
}


async def _setup(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    plan.patient = patient
    situation = await make_situation(db, plan)
    step = await make_rung(db, situation=situation, behavior_type="scenario", name="Make eye contact with John")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    return org, plan, situation, step, clinician


async def test_session_setup_keeps_how_they_will_know_and_the_safety_behaviors(api, db):
    _, plan, _, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)
    assert r.status_code == 201, r.text
    assert r.json()["how_will_i_know"] == ANSWERS["how_will_i_know"]
    assert r.json()["tempting_behaviors"] == ANSWERS["tempting_behaviors"]

    # The child sees them when finishing it at home.
    api.sign_in_as(plan.patient.user)
    pending = (await api.get("/patient/experiments/pending")).json()
    mine = next(e for e in pending if e["id"] == r.json()["id"])
    assert mine["how_will_i_know"] == ANSWERS["how_will_i_know"]
    assert mine["tempting_behaviors"] == ANSWERS["tempting_behaviors"]


async def test_the_setup_screen_offers_this_situations_safety_behaviors_only(api, db):
    org, plan, situation, step, _ = await _setup(db)
    await make_rung(db, situation=situation, behavior_type="safety", name="Looks at the floor")
    await make_rung(db, situation=situation, behavior_type="avoidance", name="Takes the long way round")
    await make_rung(db, situation=situation, behavior_type="ritual", name="Counts to ten")
    await make_rung(db, situation=situation, behavior_type="observation", name="Complained of stomach pain")
    other = await make_situation(db, plan, name="Another thing")
    await make_rung(db, situation=other, behavior_type="safety", name="Somewhere else entirely")

    api.sign_in_as(plan.patient.user)
    r = await api.get(f"/patient/behaviors/{step.id}")

    assert r.status_code == 200, r.text
    assert r.json()["safety_behaviors"] == ["Looks at the floor", "Takes the long way round", "Counts to ten"]


async def test_another_child_cannot_read_the_safety_behaviors(api, db):
    org, _, situation, step, _ = await _setup(db)
    await make_rung(db, situation=situation, behavior_type="safety", name="Looks at the floor")
    intruder = await make_patient(db, org, name="Intruder Child")

    api.sign_in_as(intruder.user)
    r = await api.get(f"/patient/behaviors/{step.id}")

    assert r.status_code == 404


async def test_the_debrief_keeps_whether_they_were_surprised_and_the_clinician_sees_it(api, db):
    _, plan, _, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)
    exp_id = (await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)).json()["id"]

    api.sign_in_as(plan.patient.user)
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={
        "feared_outcome_occurred": False, "what_happened": "One person said hi", "was_surprised": True,
        "distress_thermometer_actual": 3, "bip_after": 30, "what_learned": "Less bad than I thought",
    })
    assert r.status_code == 200, r.text
    assert r.json()["was_surprised"] is True

    api.sign_in_as(clinician.user)
    rows = (await api.get(f"/patients/{plan.patient.id}/experiments")).json()
    row = next(e for e in rows if e["id"] == exp_id)
    assert row["was_surprised"] is True
    assert row["what_happened"] == "One person said hi"
    assert row["how_will_i_know"] == ANSWERS["how_will_i_know"]
    assert row["prediction"] == ANSWERS["prediction"]


async def test_surprised_can_be_left_out(api, db):
    """Older apps, and a child who skips it, send no answer."""
    _, plan, _, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)
    exp_id = (await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)).json()["id"]

    api.sign_in_as(plan.patient.user)
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={
        "feared_outcome_occurred": True, "what_happened": "", "distress_thermometer_actual": 5,
        "bip_after": 60, "what_learned": "",
    })
    assert r.status_code == 200, r.text
    assert r.json()["was_surprised"] is None
