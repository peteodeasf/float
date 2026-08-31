"""A clinician sees a patient because they were granted access, not because they share a clinic.

The route sweep proves nothing leaks. These prove the other half — that the people who SHOULD get
through still do, and that the ways of getting through behave as decided.

Decisions behind these tests (Peter, 2026-08-28), recorded in
docs/plans/clinician-patient-access-grants.md:
  - an institution admin sees every patient in their institution, no grant needed
  - a grant lasts until it is revoked; there is no expiry
"""
import pytest

from tests.factories import (
    grant_patient_to, make_org, make_org_admin, make_patient, make_plan, make_practitioner,
    make_situation,
)


async def test_granted_clinician_can_open_the_patient(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    r = await api.get(f"/patients/{plan.patient.id}")

    assert r.status_code == 200


async def test_clinician_without_a_grant_cannot(api, db):
    """The hole this closed: same institution used to be enough."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    stranger = await make_practitioner(db, org)

    api.sign_in_as(stranger.user)
    r = await api.get(f"/patients/{plan.patient.id}")

    # 404 and not 403 on purpose. A 403 would confirm the patient exists, which is enough to map a
    # colleague's caseload by trying ids.
    assert r.status_code == 404


async def test_institution_admin_needs_no_grant(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    r = await api.get(f"/patients/{plan.patient.id}")

    assert r.status_code == 200


async def test_admin_of_another_institution_gets_nothing(api, db):
    """Being an admin somewhere is not being an admin here."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    other_org = await make_org(db)
    outsider = await make_org_admin(db, other_org)

    api.sign_in_as(outsider.user)
    r = await api.get(f"/patients/{plan.patient.id}")

    assert r.status_code == 404


async def test_revoked_grant_stops_working(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    grant = await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200

    from datetime import datetime, timezone
    grant.revoked_at = datetime.now(timezone.utc)
    await db.flush()

    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 404


async def test_roster_shows_only_granted_patients(api, db):
    org = await make_org(db)
    mine = await make_plan(db, org)
    theirs = await make_plan(db, org)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, mine.patient, clinician)

    api.sign_in_as(clinician.user)
    r = await api.get("/patients")

    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert str(mine.patient.id) in ids
    assert str(theirs.patient.id) not in ids


async def test_admin_roster_shows_the_whole_institution(api, db):
    org = await make_org(db)
    a = await make_plan(db, org)
    b = await make_plan(db, org)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    r = await api.get("/patients")

    ids = {p["id"] for p in r.json()}
    assert {str(a.patient.id), str(b.patient.id)} <= ids


async def test_a_clinician_can_grant_a_colleague(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    colleague = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner)

    api.sign_in_as(owner.user)
    r = await api.post(f"/patients/{plan.patient.id}/access",
                       json={"practitioner_id": str(colleague.id)})
    assert r.status_code == 201

    api.sign_in_as(colleague.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200


async def test_cannot_grant_a_clinician_from_another_institution(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner)
    outsider = await make_practitioner(db, await make_org(db))

    api.sign_in_as(owner.user)
    r = await api.post(f"/patients/{plan.patient.id}/access",
                       json={"practitioner_id": str(outsider.id)})

    assert r.status_code == 404


async def test_a_clinician_without_access_cannot_grant_it_to_themselves(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    stranger = await make_practitioner(db, org)

    api.sign_in_as(stranger.user)
    r = await api.post(f"/patients/{plan.patient.id}/access",
                       json={"practitioner_id": str(stranger.id)})

    assert r.status_code == 404


async def test_revoking_the_last_grant_is_refused(api, db):
    """Otherwise a patient ends up with nobody who can open them."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    only_one = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, only_one)

    api.sign_in_as(only_one.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{only_one.id}")

    assert r.status_code == 409


async def test_revoking_works_when_someone_else_still_has_access(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    first = await make_practitioner(db, org)
    second = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, first)
    await grant_patient_to(db, plan.patient, second)

    api.sign_in_as(first.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{second.id}")
    assert r.status_code == 204

    api.sign_in_as(second.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 404


async def test_plan_routes_are_reachable_through_the_plan_id_too(api, db):
    """The sweep found five routes open through {plan_id} after the patient-keyed ones were shut.
    This is the positive side: a granted clinician still gets through that door."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    await make_situation(db, plan, name="Attending school")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    r = await api.get(f"/plans/{plan.id}/triggers")

    assert r.status_code == 200
    assert [t["name"] for t in r.json()] == ["Attending school"]


async def test_adding_a_patient_gives_the_clinician_access_to_them(api, db):
    """The gap the grants change opened, found by using the app rather than by a test.

    Access became an explicit grant, and nothing granted it at creation — so a clinician could add
    a patient and then get 404 opening them. Only institution admins were unaffected, which is why
    it was not obvious.
    """
    org = await make_org(db)
    clinician = await make_practitioner(db, org)
    api.sign_in_as(clinician.user)

    created = await api.post("/patients", json={
        "name": "Newly Added", "age": 12, "email": "newly-added@example.com",
    })
    assert created.status_code == 201, created.text
    patient_id = created.json()["id"]

    # The thing that was broken: open the patient you just added.
    assert (await api.get(f"/patients/{patient_id}")).status_code == 200

    # And they appear on the roster, which filters on grants.
    roster = await api.get("/patients")
    assert patient_id in {p["id"] for p in roster.json()}


async def test_a_colleague_still_cannot_open_a_patient_you_added(api, db):
    """The grant is for the clinician who added them, not for the institution."""
    org = await make_org(db)
    clinician = await make_practitioner(db, org)
    colleague = await make_practitioner(db, org)

    api.sign_in_as(clinician.user)
    created = await api.post("/patients", json={
        "name": "Mine Only", "age": 13, "email": "mine-only@example.com",
    })
    patient_id = created.json()["id"]

    api.sign_in_as(colleague.user)
    assert (await api.get(f"/patients/{patient_id}")).status_code == 404
