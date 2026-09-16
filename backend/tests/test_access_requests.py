"""Request access, Float approving it, the self-serve switch, and suspending a practice.

docs/plans/clinician-practice-onboarding.md, steps 4 and 7.
"""
import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.organization import Organization
from app.models.practice import AccessRequest, PracticeManagerProfile
from app.models.user import User, UserRole

from tests.factories import _make_user, make_org, make_practitioner


@pytest.fixture(autouse=True)
def email_configured(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PRACTICE_SIGNUP_MODE", "approval")


def a_request(**overrides) -> dict:
    body = {
        "name": "Dana Lee",
        "email": f"dana-{uuid.uuid4().hex[:8]}@example.com",
        "role": "clinician",
        "credentials": "PhD",
        "practice_name": "Harbor Kids Therapy",
        "state": "CA",
        "practice_size": 3,
    }
    body.update(overrides)
    return body


async def stored(db, email) -> AccessRequest:
    return (await db.execute(select(AccessRequest).where(AccessRequest.email == email))).scalar_one()


async def sign_in_float_admin(api, db):
    admin = await _make_user(db, await make_org(db), "admin")
    api.sign_in_as(admin)
    return admin


async def test_a_request_is_saved_and_nothing_is_created(api, db, no_outbound):
    body = a_request()
    r = await api.post("/access-requests", json=body)

    assert r.json() == {"success": True}
    assert (await stored(db, body["email"])).status == "new"
    assert (await db.execute(select(User).where(User.email == body["email"]))).first() is None
    assert no_outbound["email"] == []


async def existing_clinician(db):
    """A clinician already using Float, with an address the request form accepts."""
    existing = await make_practitioner(db, await make_org(db))
    existing.user.email = f"existing-{uuid.uuid4().hex[:8]}@example.com"
    await db.flush()
    return existing


async def test_an_email_that_has_an_account_gets_the_same_answer(api, db):
    existing = await existing_clinician(db)

    r = await api.post("/access-requests", json=a_request(email=existing.user.email))
    assert r.json() == {"success": True}


async def test_approving_creates_the_practice_in_setup_and_sends_a_link(api, db, no_outbound):
    body = a_request()
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])

    await sign_in_float_admin(api, db)
    r = await api.post(f"/admin/access-requests/{request.id}/approve")
    assert r.status_code == 200, r.text

    org = await db.get(Organization, uuid.UUID(r.json()["organization_id"]))
    assert org.status == "setting_up"
    assert (org.name, org.state, org.size) == ("Harbor Kids Therapy", "CA", 3)
    user = (await db.execute(select(User).where(User.email == body["email"]))).scalar_one()
    role = (await db.execute(select(UserRole).where(UserRole.user_id == user.id))).scalar_one()
    assert (role.role, role.is_org_admin) == ("practitioner", True)
    assert "/setup#token=" in no_outbound["email"][-1]["text"]
    assert (await stored(db, body["email"])).status == "approved"


async def test_an_office_manager_request_creates_a_manager_not_a_clinician(api, db):
    body = a_request(role="practice_manager", credentials=None)
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])

    await sign_in_float_admin(api, db)
    await api.post(f"/admin/access-requests/{request.id}/approve")

    user = (await db.execute(select(User).where(User.email == body["email"]))).scalar_one()
    assert (await db.execute(
        select(PracticeManagerProfile).where(PracticeManagerProfile.user_id == user.id)
    )).scalar_one().name == "Dana Lee"
    api.sign_in_as(user)
    assert (await api.get("/patients")).status_code == 403


async def test_a_request_cannot_be_approved_twice(api, db):
    body = a_request()
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])

    await sign_in_float_admin(api, db)
    await api.post(f"/admin/access-requests/{request.id}/approve")
    r = await api.post(f"/admin/access-requests/{request.id}/approve")
    assert r.status_code == 409


async def test_declining_sends_nothing(api, db, no_outbound):
    body = a_request()
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])

    await sign_in_float_admin(api, db)
    r = await api.post(f"/admin/access-requests/{request.id}/decline")
    assert r.status_code == 200
    assert (await stored(db, body["email"])).status == "declined"
    assert no_outbound["email"] == []


async def test_only_a_float_admin_sees_or_approves_requests(api, db):
    body = a_request()
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])

    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    assert (await api.get("/admin/access-requests")).status_code == 403
    assert (await api.post(f"/admin/access-requests/{request.id}/approve")).status_code == 403


async def test_in_open_mode_a_request_is_approved_straight_away(api, db, no_outbound, monkeypatch):
    monkeypatch.setattr(settings, "PRACTICE_SIGNUP_MODE", "open")
    body = a_request()

    await api.post("/access-requests", json=body)

    assert (await stored(db, body["email"])).status == "approved"
    assert "/setup#token=" in no_outbound["email"][-1]["text"]


async def test_in_open_mode_an_existing_email_is_left_for_float(api, db, no_outbound, monkeypatch):
    monkeypatch.setattr(settings, "PRACTICE_SIGNUP_MODE", "open")
    existing = await existing_clinician(db)

    r = await api.post("/access-requests", json=a_request(email=existing.user.email))

    assert r.json() == {"success": True}
    assert (await stored(db, existing.user.email)).status == "new"
    assert no_outbound["email"] == []


async def test_repeated_requests_from_one_email_stop_being_saved(api, db):
    email = f"repeat-{uuid.uuid4().hex[:8]}@example.com"
    for _ in range(5):
        assert (await api.post("/access-requests", json=a_request(email=email))).json() == {"success": True}

    rows = (await db.execute(select(AccessRequest).where(AccessRequest.email == email))).scalars().all()
    assert len(rows) == 3


async def test_suspending_a_practice_locks_it_and_reactivating_lets_it_back(api, db):
    org = await make_org(db)
    clinician = await make_practitioner(db, org)
    await sign_in_float_admin(api, db)

    r = await api.request("PUT", f"/admin/organizations/{org.id}/status", json={"status": "suspended"})
    assert r.json()["status"] == "suspended"
    api.sign_in_as(clinician.user)
    assert (await api.get("/patients")).status_code == 403

    await sign_in_float_admin(api, db)
    r = await api.request("PUT", f"/admin/organizations/{org.id}/status", json={"status": "active"})
    assert r.json()["status"] == "active"
    api.sign_in_as(clinician.user)
    assert (await api.get("/patients")).status_code == 200


async def test_reactivating_a_practice_that_never_signed_the_baa_returns_it_to_setup(api, db):
    body = a_request()
    await api.post("/access-requests", json=body)
    request = await stored(db, body["email"])
    await sign_in_float_admin(api, db)
    org_id = (await api.post(f"/admin/access-requests/{request.id}/approve")).json()["organization_id"]

    await api.request("PUT", f"/admin/organizations/{org_id}/status", json={"status": "suspended"})
    r = await api.request("PUT", f"/admin/organizations/{org_id}/status", json={"status": "active"})

    assert r.json()["status"] == "setting_up"
