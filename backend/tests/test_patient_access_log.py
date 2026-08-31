"""Who opened which patient record.

The grants tests prove who MAY. These prove we record who DID — the thing a patient asking for a
list of everyone who saw their file needs.

Plan: docs/plans/patient-access-log.md
"""
from sqlalchemy import select

from app.models.patient import PatientAccessLog
from tests.factories import (
    grant_patient_to, make_org, make_org_admin, make_plan, make_practitioner,
)


async def _log(db, patient_id=None):
    """Rows for one patient.

    Deliberately not "all rows": the access log commits inside the request, which escapes the
    per-test rollback, so the table carries rows from other tests. Asserting on a global count made
    these tests pass or fail depending on what ran before them.
    """
    q = select(PatientAccessLog)
    if patient_id is not None:
        q = q.where(PatientAccessLog.patient_id == patient_id)
    return (await db.execute(q)).scalars().all()


async def test_opening_a_patient_is_recorded(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200

    rows = await _log(db, plan.patient.id)
    assert len(rows) == 1
    assert rows[0].patient_id == plan.patient.id
    assert rows[0].user_id == clinician.user.id
    assert rows[0].practitioner_id == clinician.id
    assert rows[0].via == "grant"
    assert rows[0].method == "GET"
    assert rows[0].path == f"/patients/{plan.patient.id}"


async def test_an_admin_is_recorded_as_an_admin(api, db):
    """Institution admins bypass grants. Without this the log cannot tell ordinary access from an
    admin opening a record nobody granted them."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200

    rows = await _log(db, plan.patient.id)
    assert len(rows) == 1
    assert rows[0].via == "admin"


async def test_a_refused_read_records_nothing(api, db):
    """This answers "who saw this file", not "who tried"."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    stranger = await make_practitioner(db, org)

    api.sign_in_as(stranger.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 404

    assert await _log(db, plan.patient.id) == []


async def test_reaching_a_patient_through_a_plan_is_recorded_too(api, db):
    """The point of writing this in one place: routes that never name a patient are covered."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    assert (await api.get(f"/plans/{plan.id}/triggers")).status_code == 200

    rows = await _log(db, plan.patient.id)
    assert len(rows) == 1
    assert rows[0].patient_id == plan.patient.id
    assert rows[0].path == f"/plans/{plan.id}/triggers"


async def test_the_log_is_readable_by_an_institution_admin(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)
    admin = await make_org_admin(db, org)

    api.sign_in_as(clinician.user)
    await api.get(f"/patients/{plan.patient.id}")

    api.sign_in_as(admin.user)
    r = await api.get(f"/patients/{plan.patient.id}/access-log")

    assert r.status_code == 200
    entries = r.json()
    assert any(e["user_email"] == clinician.user.email and e["via"] == "grant" for e in entries)


async def test_a_clinician_with_a_grant_cannot_read_the_log(api, db):
    """The log records the people who read the file. They do not get to decide what it says."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    r = await api.get(f"/patients/{plan.patient.id}/access-log")

    assert r.status_code == 404


async def test_an_admin_from_another_institution_cannot_read_it(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    outsider = await make_org_admin(db, await make_org(db))

    api.sign_in_as(outsider.user)
    r = await api.get(f"/patients/{plan.patient.id}/access-log")

    assert r.status_code == 404
