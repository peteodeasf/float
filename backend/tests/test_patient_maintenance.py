"""Moving a patient into maintenance, and back.

Peter, 2026-10-21 (issue #53): Maintenance is set by the clinician by hand, the same way as closing
a patient. Some things will work differently for a patient in maintenance later; for now only the
phase changes. These tests hold both halves of that.
"""
from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner


async def _patient_with_clinician(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    await make_plan(db, org, patient=patient)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician)
    return org, patient, clinician


def _row(rows, patient):
    return next(p for p in rows if p["id"] == str(patient.id))


async def test_a_clinician_can_move_a_patient_into_maintenance_and_back(api, db):
    """The list shows Maintenance, and ending it puts the patient back to what their plan says."""
    org, patient, clinician = await _patient_with_clinician(db)
    api.sign_in_as(clinician.user)

    assert (await api.post(f"/patients/{patient.id}/maintenance")).status_code == 200
    await db.refresh(patient)
    assert patient.maintenance_by_practitioner_id == clinician.id
    row = _row((await api.get("/patients")).json(), patient)
    assert (row["phase"], row["phase_label"]) == ("maintenance", "Maintenance")
    assert (await api.get(f"/patients/{patient.id}")).json()["maintenance_at"] is not None

    assert (await api.post(f"/patients/{patient.id}/end-maintenance")).status_code == 200
    row = _row((await api.get("/patients")).json(), patient)
    assert row["phase"] != "maintenance"
    assert (await api.get(f"/patients/{patient.id}")).json()["maintenance_at"] is None


async def test_maintenance_does_not_switch_off_the_apps(api, db):
    """Unlike closing. Peter said not to build anything else for maintenance yet, so the child must
    still be able to use their app."""
    org, patient, clinician = await _patient_with_clinician(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/maintenance")

    api.sign_in_as(patient.user)
    assert (await api.get("/auth/me")).json()["treatment_closed"] is False
    r = await api.post("/patient/messages", json={"content": "hello", "message_type": "general"})
    assert r.status_code != 403


async def test_closing_a_patient_in_maintenance_shows_closed(api, db):
    """Closed wins on the list. Reopening brings them back to Maintenance, because closing did not
    undo the clinician's choice."""
    org, patient, clinician = await _patient_with_clinician(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/maintenance")
    await api.post(f"/patients/{patient.id}/close")
    assert _row((await api.get("/patients")).json(), patient)["phase"] == "closed"

    await api.post(f"/patients/{patient.id}/reopen")
    assert _row((await api.get("/patients")).json(), patient)["phase"] == "maintenance"


async def test_a_clinician_without_access_cannot_change_it(api, db):
    """The same access check as every other change to a patient: a clinician at the clinic who has
    not been given this patient gets nothing."""
    org, patient, _ = await _patient_with_clinician(db)
    outsider = await make_practitioner(db, org)
    api.sign_in_as(outsider.user)

    for path in ("maintenance", "end-maintenance"):
        r = await api.post(f"/patients/{patient.id}/{path}")
        assert r.status_code in (403, 404)
    await db.refresh(patient)
    assert patient.maintenance_at is None


async def test_the_child_cannot_change_it(api, db):
    """Only a clinician moves a patient between phases."""
    org, patient, _ = await _patient_with_clinician(db)
    api.sign_in_as(patient.user)

    r = await api.post(f"/patients/{patient.id}/maintenance")
    assert r.status_code in (401, 403, 404)
    await db.refresh(patient)
    assert patient.maintenance_at is None
