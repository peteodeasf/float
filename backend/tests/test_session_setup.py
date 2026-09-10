"""Setting an exposure up in session, and the child's side of finishing it.

Plan: docs/plans/teen-home-ladder-and-session-setup.md
"""
from datetime import datetime, timedelta, timezone

from app.models.experiment import Experiment

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)

ANSWERS = {
    "prediction": "He'll think I'm weird and look away",
    "bip_before": 70,
    "distress_thermometer_expected": 6,
    "confidence_level": "medium",
}


def _in(days: int) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.replace(hour=9, minute=0, second=0, microsecond=0).isoformat()


async def _setup(db):
    org = await make_org(db)
    # make_patient, not make_plan's own: only the factory's patient carries its login as `.user`.
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    plan.patient = patient
    situation = await make_situation(db, plan)
    step = await make_rung(db, situation=situation, behavior_type="scenario",
                           name="Make eye contact with John")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician, owner=True)
    return org, plan, step, clinician


async def test_set_up_with_a_day_is_ready_to_do(api, db):
    _, plan, step, clinician = await _setup(db)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/behaviors/{step.id}/session-setup", json={
        **ANSWERS, "scheduled_date": _in(2), "scheduled_time_bucket": "morning",
    })

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "committed"
    assert body["prediction"] == ANSWERS["prediction"]
    assert body["plan_description"] == "Make eye contact with John"
    assert body["patient_id"] == str(plan.patient.id)


async def test_leaving_the_day_for_the_child_waits_on_them(api, db):
    _, _, step, clinician = await _setup(db)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)

    assert r.status_code == 201, r.text
    assert r.json()["status"] == "planned"
    assert r.json()["scheduled_date"] is None
    assert r.json()["bip_before"] == 70


async def test_the_child_finishes_it_by_picking_the_day(api, db):
    """Answered in session, day left for home: the child sees it waiting and adds the day."""
    _, plan, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)
    exp_id = (await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)).json()["id"]

    api.sign_in_as(plan.patient.user)
    pending = (await api.get("/patient/experiments/pending")).json()
    waiting = next(e for e in pending if e["id"] == exp_id)
    assert waiting["status"] == "planned"
    assert waiting["prediction"] == ANSWERS["prediction"]

    r = await api.put(f"/patient/experiments/{exp_id}/before", json={
        "plan_description": "Make eye contact with John", **ANSWERS,
        "scheduled_date": _in(3), "scheduled_time_bucket": "evening",
    })
    assert r.status_code == 200, r.text
    assert (await api.post(f"/patient/experiments/{exp_id}/commit")).status_code == 200

    pending = (await api.get("/patient/experiments/pending")).json()
    done = next(e for e in pending if e["id"] == exp_id)
    assert done["status"] == "committed"
    assert done["scheduled_date"] is not None
    assert done["scheduled_time_bucket"] == "evening"


async def test_a_clinician_without_access_cannot_set_one_up(api, db):
    org, _, step, _ = await _setup(db)
    outsider = await make_practitioner(db, org)

    api.sign_in_as(outsider.user)
    r = await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)

    assert r.status_code in (403, 404)


async def test_the_answers_are_checked(api, db):
    _, _, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)

    for bad in ({"bip_before": 150}, {"distress_thermometer_expected": 0},
                {"confidence_level": "maybe"}, {"scheduled_time_bucket": "noon"}):
        r = await api.post(f"/behaviors/{step.id}/session-setup", json={**ANSWERS, **bad})
        assert r.status_code == 422, (bad, r.text)


# ── The child's own saves must be their own ──────────────────────────────────

async def _two_children(db, status):
    org = await make_org(db)
    victim = await make_patient(db, org, name="Victim Child")
    intruder = await make_patient(db, org, name="Intruder Child")
    exp = Experiment(patient_id=victim.id, organization_id=org.id, status=status,
                     plan_description="the victim's plan", prediction="the victim's fear")
    db.add(exp)
    await db.flush()
    return victim, intruder, exp


async def test_a_child_cannot_save_answers_on_another_childs_exposure(api, db):
    """`/patient/experiments/{id}/before` checked the clinic and not the child."""
    _, intruder, exp = await _two_children(db, "planned")

    api.sign_in_as(intruder.user)
    # Complete, so a 422 cannot pass for protection.
    r = await api.put(f"/patient/experiments/{exp.id}/before", json={
        "plan_description": "tampered", "prediction": "tampered", "bip_before": 50,
        "distress_thermometer_expected": 5, "confidence_level": "high",
    })
    assert r.status_code != 422, r.text

    await db.refresh(exp)
    assert exp.prediction == "the victim's fear"
    assert r.status_code == 404


async def test_a_child_cannot_record_an_outcome_on_another_childs_exposure(api, db):
    """`/patient/experiments/{id}/after` had the same hole."""
    _, intruder, exp = await _two_children(db, "committed")

    api.sign_in_as(intruder.user)
    r = await api.put(f"/patient/experiments/{exp.id}/after", json={
        "feared_outcome_occurred": True, "what_happened": "tampered",
        "distress_thermometer_actual": 5, "bip_after": 50, "what_learned": "tampered",
    })
    assert r.status_code != 422, r.text

    await db.refresh(exp)
    assert exp.what_happened != "tampered"
    assert r.status_code == 404
