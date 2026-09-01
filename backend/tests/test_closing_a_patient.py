"""Closing a patient.

Treatment finished. The clinician keeps everything and can still read it; the child's app and the
parent's app stop. Peter, 2026-08-31: they should not carry on using them unsupervised once a
clinician has ended the case.

They are NOT locked out at the login screen. They sign in and find nothing to do — so reads keep
working and only writes are refused. These tests hold that line, because "closed" being enforced
too hard would leave a child staring at an error instead of "All done for now".
"""
from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_situation,
)


async def _closed_patient(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician)
    await make_situation(db, plan, name="Eating in the cafeteria")
    return org, patient, plan, clinician


async def test_a_clinician_can_close_and_reopen(api, db):
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)

    assert (await api.post(f"/patients/{patient.id}/close")).status_code == 200
    await db.refresh(patient)
    assert patient.closed_at is not None
    assert patient.closed_by_practitioner_id == clinician.id

    assert (await api.post(f"/patients/{patient.id}/reopen")).status_code == 200
    await db.refresh(patient)
    assert patient.closed_at is None


async def test_the_clinician_still_sees_everything(api, db):
    """Closing is finishing treatment, not deleting anyone."""
    org, patient, plan, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/close")

    assert (await api.get(f"/patients/{patient.id}")).status_code == 200
    triggers = await api.get(f"/plans/{plan.id}/triggers")
    assert triggers.status_code == 200
    assert [t["name"] for t in triggers.json()] == ["Eating in the cafeteria"]


async def test_the_child_can_still_sign_in_and_read(api, db):
    """If reads were refused too, a child would meet an error rather than "All done for now"."""
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/close")

    api.sign_in_as(patient.user)
    assert (await api.get("/patient/ladder")).status_code == 200

    me = await api.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["treatment_closed"] is True


async def test_the_child_cannot_change_anything(api, db):
    org, patient, plan, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/close")

    api.sign_in_as(patient.user)
    r = await api.post("/patient/messages", json={"content": "hello", "message_type": "general"})

    assert r.status_code == 403
    assert r.json()["detail"] == "Treatment is closed"


async def test_an_open_patient_is_untouched(api, db):
    """The obvious way to get this wrong is to refuse writes for everyone."""
    org, patient, _, clinician = await _closed_patient(db)

    api.sign_in_as(patient.user)
    me = await api.get("/auth/me")
    assert me.json()["treatment_closed"] is False

    r = await api.post("/patient/messages", json={"content": "hello", "message_type": "general"})
    assert r.status_code != 403


async def test_reopening_gives_the_apps_back(api, db):
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/close")
    await api.post(f"/patients/{patient.id}/reopen")

    api.sign_in_as(patient.user)
    assert (await api.get("/auth/me")).json()["treatment_closed"] is False
    r = await api.post("/patient/messages", json={"content": "hello", "message_type": "general"})
    assert r.status_code != 403


async def test_closing_twice_does_not_move_the_date(api, db):
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)

    await api.post(f"/patients/{patient.id}/close")
    await db.refresh(patient)
    first = patient.closed_at

    await api.post(f"/patients/{patient.id}/close")
    await db.refresh(patient)
    assert patient.closed_at == first


async def test_reading_the_patient_back_says_they_are_closed(api, db):
    """The button on the patient page flips on this field, and it was being dropped.

    Three handlers build PatientResponse field by field rather than from the model, so a field
    added to the schema is silently absent from the response. Closing worked, reading it back said
    closed_at: None, and the button would never have changed.
    """
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)

    await api.post(f"/patients/{patient.id}/close")

    r = await api.get(f"/patients/{patient.id}")
    assert r.status_code == 200
    assert r.json()["closed_at"] is not None

    await api.post(f"/patients/{patient.id}/reopen")
    assert (await api.get(f"/patients/{patient.id}")).json()["closed_at"] is None


async def test_the_list_says_so_too(api, db):
    org, patient, _, clinician = await _closed_patient(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/close")

    row = next(p for p in (await api.get("/patients")).json() if p["id"] == str(patient.id))
    assert row["phase"] == "closed"
    assert row["phase_label"] == "Closed"
    assert row["closed_at"] is not None
