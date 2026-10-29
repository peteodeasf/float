"""One unfinished treatment plan per patient.

Issue #92. On an older test patient, Create treatment plan "cycles for a bit and then nothing
happens". The patient had two unfinished plans. Every lookup of "the patient's plan" expects one,
so loading the plan failed, the Plan tab showed "No treatment plan yet", and each click on Create
made yet another plan. These tests hold the line that stops it happening again.
"""
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models.treatment import TreatmentPlan
from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner


async def _patient_and_clinician(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician)
    return org, patient, clinician


async def _open_plan_count(db, patient) -> int:
    return (await db.execute(
        select(func.count()).select_from(TreatmentPlan).where(
            TreatmentPlan.patient_id == patient.id, TreatmentPlan.status != "complete",
        )
    )).scalar_one()


async def test_create_on_a_patient_with_a_plan_hands_back_that_plan(api, db):
    """The click that made the second plan. It must return the plan already there, not add one."""
    org, patient, clinician = await _patient_and_clinician(db)
    existing = await make_plan(db, org, patient=patient)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/plan", json={})

    assert r.status_code == 200
    assert r.json()["id"] == str(existing.id)
    assert await _open_plan_count(db, patient) == 1


async def test_create_twice_leaves_one_plan_that_loads(api, db):
    """A double click on a new patient. Both calls return the same plan and the Plan tab loads it."""
    org, patient, clinician = await _patient_and_clinician(db)
    api.sign_in_as(clinician.user)

    first = await api.post(f"/patients/{patient.id}/plan", json={})
    second = await api.post(f"/patients/{patient.id}/plan", json={})

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    loaded = await api.get(f"/patients/{patient.id}/plan")
    assert loaded.status_code == 200
    assert loaded.json()["id"] == first.json()["id"]


async def test_the_database_refuses_a_second_unfinished_plan(db):
    """The check in the code can be raced by two requests at once. The database rule cannot."""
    org = await make_org(db)
    patient = await make_patient(db, org)
    first = await make_plan(db, org, patient=patient)

    db.add(TreatmentPlan(
        patient_id=patient.id, organization_id=org.id,
        practitioner_id=first.practitioner_id, status="setup",
    ))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_a_finished_plan_does_not_block_a_new_one(api, db):
    """Completed plans are history. A patient who comes back can start again."""
    org, patient, clinician = await _patient_and_clinician(db)
    old = await make_plan(db, org, patient=patient)
    old.status = "complete"
    await db.flush()
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/plan", json={})

    assert r.status_code == 201
    assert r.json()["id"] != str(old.id)


async def test_reopening_a_finished_plan_while_another_is_open_is_refused(api, db):
    """Without this the database rule would turn the request into a server error."""
    org, patient, clinician = await _patient_and_clinician(db)
    old = await make_plan(db, org, patient=patient)
    old.status = "complete"
    await db.flush()
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/plan", json={})

    r = await api.put(f"/patients/{patient.id}/plan/{old.id}", json={"status": "active"})

    assert r.status_code == 409
    assert await _open_plan_count(db, patient) == 1
