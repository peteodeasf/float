"""Practice admins managing their colleagues, and office managers handing patients to clinicians.

docs/plans/clinician-practice-onboarding.md, steps 5 and 6.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.patient import PatientAccessGrant, PatientAccessLog
from app.models.practice import PracticeManagerProfile
from app.models.user import User, UserRole

from tests.factories import (
    _make_user, grant_patient_to, make_org, make_org_admin, make_patient, make_practitioner,
)


@pytest.fixture(autouse=True)
def email_configured(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")


async def make_manager(db, org) -> User:
    user = await _make_user(db, org, "practice_manager")
    role = (await db.execute(select(UserRole).where(UserRole.user_id == user.id))).scalar_one()
    role.is_org_admin = True
    db.add(PracticeManagerProfile(user_id=user.id, organization_id=org.id, name="Morgan Office"))
    await db.flush()
    return user


def an_email() -> str:
    return f"invitee-{uuid.uuid4().hex[:8]}@example.com"


# ── People ──

async def test_an_admin_invites_a_clinician_who_gets_a_setup_link(api, db, no_outbound):
    org = await make_org(db)
    admin = await make_org_admin(db, org)
    api.sign_in_as(admin.user)

    email = an_email()
    r = await api.post("/practice/members", json={"name": "Jo Park", "email": email, "role": "clinician"})
    assert r.status_code == 201, r.text
    assert "/setup#token=" in no_outbound["email"][-1]["text"]

    members = (await api.get("/practice/members")).json()
    invited = next(x for x in members if x["email"] == email)
    assert (invited["status"], invited["role"], invited["is_admin"]) == ("invited", "clinician", False)


async def test_an_invited_office_manager_is_an_admin(api, db):
    org = await make_org(db)
    api.sign_in_as((await make_org_admin(db, org)).user)

    email = an_email()
    await api.post("/practice/members", json={"name": "Morgan", "email": email, "role": "practice_manager"})
    invited = next(x for x in (await api.get("/practice/members")).json() if x["email"] == email)
    assert (invited["role"], invited["is_admin"]) == ("practice_manager", True)


async def test_a_clinician_who_is_not_an_admin_cannot_manage_people(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    api.sign_in_as(me.user)

    assert (await api.get("/practice/members")).status_code == 403
    r = await api.post("/practice/members", json={"name": "X", "email": an_email(), "role": "clinician"})
    assert r.status_code == 403


async def test_an_admin_cannot_touch_someone_in_another_practice(api, db):
    mine, theirs = await make_org(db), await make_org(db)
    api.sign_in_as((await make_org_admin(db, mine)).user)
    other = await make_practitioner(db, theirs)

    assert (await api.delete(f"/practice/members/{other.user.id}")).status_code == 404
    r = await api.request("PUT", f"/practice/members/{other.user.id}/admin", json={"is_admin": True})
    assert r.status_code == 404


async def test_the_last_admin_cannot_stop_being_admin(api, db):
    org = await make_org(db)
    admin = await make_org_admin(db, org)
    api.sign_in_as(admin.user)

    r = await api.request("PUT", f"/practice/members/{admin.user.id}/admin", json={"is_admin": False})
    assert r.status_code == 409


async def test_an_admin_can_make_a_colleague_an_admin(api, db):
    org = await make_org(db)
    api.sign_in_as((await make_org_admin(db, org)).user)
    colleague = await make_practitioner(db, org)

    r = await api.request("PUT", f"/practice/members/{colleague.user.id}/admin", json={"is_admin": True})
    assert r.status_code == 200
    api.sign_in_as(colleague.user)
    assert (await api.get("/practice/members")).status_code == 200


async def test_removing_a_colleague_stops_their_account_and_keeps_their_patients(api, db):
    org = await make_org(db)
    api.sign_in_as((await make_org_admin(db, org)).user)
    leaving = await make_practitioner(db, org)
    patient = await make_patient(db, org)
    await grant_patient_to(db, patient, leaving, owner=True)

    assert (await api.delete(f"/practice/members/{leaving.user.id}")).status_code == 200

    await db.refresh(leaving.user)
    assert leaving.user.deactivated_at is not None
    assert await db.get(type(patient), patient.id) is not None
    members = (await api.get("/practice/members")).json()
    assert next(x for x in members if x["user_id"] == str(leaving.user.id))["status"] == "removed"


async def test_an_admin_cannot_remove_themselves(api, db):
    org = await make_org(db)
    admin = await make_org_admin(db, org)
    api.sign_in_as(admin.user)

    assert (await api.delete(f"/practice/members/{admin.user.id}")).status_code == 409


async def test_a_removed_clinician_is_not_offered_as_a_colleague(api, db):
    org = await make_org(db)
    me = await make_org_admin(db, org)
    gone = await make_practitioner(db, org, name="Gone Clinician")
    gone.user.deactivated_at = datetime.now(timezone.utc)
    await db.flush()

    api.sign_in_as(me.user)
    names = [c["name"] for c in (await api.get("/practitioners")).json()]
    assert "Gone Clinician" not in names


# ── Office manager ──

async def test_an_office_manager_cannot_open_any_clinician_endpoint(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    manager = await make_manager(db, org)
    api.sign_in_as(manager)

    assert (await api.get("/patients")).status_code == 403
    assert (await api.get(f"/patients/{patient.id}")).status_code == 403


async def test_an_office_manager_sees_names_and_clinicians_only(api, db):
    org = await make_org(db)
    clinician = await make_practitioner(db, org, name="Dr Owner")
    patient = await make_patient(db, org, name="Casey Child")
    await grant_patient_to(db, patient, clinician, owner=True)
    manager = await make_manager(db, org)
    api.sign_in_as(manager)

    rows = (await api.get("/practice/patients")).json()
    row = next(r for r in rows if r["patient_id"] == str(patient.id))
    assert set(row) == {"patient_id", "name", "closed", "clinician", "others_with_access"}
    assert row["name"] == "Casey Child"
    assert row["clinician"]["name"] == "Dr Owner"


async def test_the_manager_viewing_the_list_is_in_the_access_log(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    manager = await make_manager(db, org)
    api.sign_in_as(manager)

    await api.get("/practice/patients")

    rows = (await db.execute(
        select(PatientAccessLog).where(PatientAccessLog.patient_id == patient.id, PatientAccessLog.user_id == manager.id)
    )).scalars().all()
    assert [r.via for r in rows] == ["practice_manager"]


async def test_an_office_manager_does_not_see_another_practices_patients(api, db):
    mine, theirs = await make_org(db), await make_org(db)
    other_patient = await make_patient(db, theirs)
    manager = await make_manager(db, mine)
    api.sign_in_as(manager)

    ids = [r["patient_id"] for r in (await api.get("/practice/patients")).json()]
    assert str(other_patient.id) not in ids
    other_clinician = await make_practitioner(db, theirs)
    r = await api.post(f"/practice/patients/{other_patient.id}/access",
                       json={"practitioner_id": str(other_clinician.id)})
    assert r.status_code == 404


async def test_an_office_manager_hands_a_patient_to_another_clinician(api, db):
    org = await make_org(db)
    leaving = await make_practitioner(db, org)
    taking_over = await make_practitioner(db, org)
    patient = await make_patient(db, org)
    await grant_patient_to(db, patient, leaving, owner=True)
    manager = await make_manager(db, org)
    api.sign_in_as(manager)

    r = await api.request("PUT", f"/practice/patients/{patient.id}/clinician",
                          json={"practitioner_id": str(taking_over.id)})
    assert r.status_code == 200, r.text

    await db.refresh(patient)
    assert patient.primary_practitioner_id == taking_over.id
    grant = (await db.execute(select(PatientAccessGrant).where(
        PatientAccessGrant.patient_id == patient.id, PatientAccessGrant.practitioner_id == taking_over.id,
    ))).scalar_one()
    assert grant.granted_by_user_id == manager.id

    api.sign_in_as(taking_over.user)
    assert (await api.get(f"/patients/{patient.id}")).status_code == 200


async def test_a_patient_cannot_be_given_to_a_removed_clinician(api, db):
    org = await make_org(db)
    gone = await make_practitioner(db, org)
    gone.user.deactivated_at = datetime.now(timezone.utc)
    patient = await make_patient(db, org)
    manager = await make_manager(db, org)
    await db.flush()
    api.sign_in_as(manager)

    r = await api.post(f"/practice/patients/{patient.id}/access", json={"practitioner_id": str(gone.id)})
    assert r.status_code == 404


async def test_a_clinician_admin_does_not_use_the_manager_patient_routes(api, db):
    org = await make_org(db)
    api.sign_in_as((await make_org_admin(db, org)).user)

    assert (await api.get("/practice/patients")).status_code == 403


async def test_no_setup_link_is_offered_or_sent_to_someone_already_using_float(api, db):
    org = await make_org(db)
    api.sign_in_as((await make_org_admin(db, org)).user)
    colleague = await make_practitioner(db, org)

    member = next(x for x in (await api.get("/practice/members")).json() if x["user_id"] == str(colleague.user.id))
    assert member["can_resend_link"] is False
    assert (await api.post(f"/practice/members/{colleague.user.id}/setup-link")).status_code == 409
