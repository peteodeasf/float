"""Setup screens, the terms and BAA, and the gate that keeps people out until setup is finished.

docs/plans/clinician-practice-onboarding.md, steps 3 and 4.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core import agreements
from app.core.config import settings
from app.models.organization import Organization
from app.models.practice import AgreementAcceptance
from app.models.user import User

from tests.factories import _make_user, make_org, make_practitioner


@pytest.fixture(autouse=True)
def email_configured(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")


async def new_colleague(api, db):
    """A clinician a Float admin has just added to an active practice. Not set up yet."""
    org = await make_org(db)
    api.sign_in_as(await _make_user(db, org, "admin"))
    r = await api.post("/admin/clinicians", json={
        "name": "New Clinician", "email": f"colleague-{uuid.uuid4().hex[:8]}@example.com", "organization_id": str(org.id),
    })
    assert r.status_code == 200, r.text
    user = await db.get(User, r.json()["user_id"])
    api.sign_in_as(user)
    return user, org


async def new_owner(api, db):
    """The person a Float admin named when creating a practice. The practice is still in setup."""
    admin_org = await make_org(db)
    api.sign_in_as(await _make_user(db, admin_org, "admin"))
    email = f"owner-{uuid.uuid4().hex[:8]}@example.com"
    r = await api.post("/admin/organizations", json={
        "name": "Harbor Kids Therapy", "admin_email": email,
    })
    assert r.status_code == 200, r.text
    org = await db.get(Organization, r.json()["id"])
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    api.sign_in_as(user)
    return user, org


def all_documents(owner: bool) -> list[dict]:
    return [{"document": a.document, "version": a.version} for a in agreements.required_for(owner)]


async def test_a_new_colleague_is_refused_by_clinician_endpoints_until_setup_is_done(api, db):
    user, _ = await new_colleague(api, db)

    r = await api.get("/patients")
    assert r.status_code == 403
    assert r.json()["detail"] == "setup_incomplete"


async def test_a_colleague_sees_details_then_agreements(api, db):
    await new_colleague(api, db)

    state = (await api.get("/setup")).json()
    assert state["steps"] == ["details", "agreements"]
    assert state["next_step"] == "details"
    assert state["is_practice_owner"] is False


async def test_a_colleague_finishes_setup_and_can_use_the_app(api, db):
    user, _ = await new_colleague(api, db)

    r = await api.request("PUT", "/setup/details", json={"name": "Sam Rivera", "credentials": "LCSW"})
    assert r.json()["next_step"] == "agreements"
    r = await api.post("/setup/agreements", json={"accepted": all_documents(owner=False)})
    assert r.status_code == 200, r.text
    assert r.json()["setup_complete"] is True

    await db.refresh(user)
    assert (await api.get("/patients")).status_code == 200


async def test_a_colleague_accepts_only_the_terms_not_the_baa(api, db):
    user, org = await new_colleague(api, db)
    await api.request("PUT", "/setup/details", json={"name": "Sam Rivera"})

    docs = (await api.get("/setup/agreements")).json()
    assert [d["document"] for d in docs] == ["terms"]
    await api.post("/setup/agreements", json={"accepted": all_documents(owner=False)})

    rows = (await db.execute(
        select(AgreementAcceptance).where(AgreementAcceptance.user_id == user.id)
    )).scalars().all()
    assert [(r.document, r.version) for r in rows] == [("terms", agreements.TERMS.version)]


async def test_a_colleague_cannot_change_the_practice(api, db):
    await new_colleague(api, db)

    r = await api.request("PUT", "/setup/practice", json={"name": "Renamed", "state": "CA"})
    assert r.status_code == 403


async def test_agreements_cannot_be_accepted_before_the_earlier_screens(api, db):
    await new_colleague(api, db)

    r = await api.post("/setup/agreements", json={"accepted": all_documents(owner=False)})
    assert r.status_code == 409


async def test_the_owner_sets_up_the_practice_and_it_becomes_active(api, db):
    user, org = await new_owner(api, db)
    assert org.status == "setting_up"

    state = (await api.get("/setup")).json()
    assert state["steps"] == ["details", "practice", "agreements"]

    await api.request("PUT", "/setup/details", json={"name": "Dana Lee", "credentials": "PhD"})
    await api.request("PUT", "/setup/practice", json={"name": "Harbor Kids", "state": "CA"})
    r = await api.post("/setup/agreements", json={
        "accepted": all_documents(owner=True), "authorized_to_sign": True,
    })
    assert r.status_code == 200, r.text

    await db.refresh(org)
    assert org.status == "active"
    assert org.name == "Harbor Kids"
    assert (await api.get("/patients")).status_code == 200


async def test_the_owner_must_accept_the_baa_and_confirm_they_can_sign(api, db):
    await new_owner(api, db)
    await api.request("PUT", "/setup/details", json={"name": "Dana Lee"})
    await api.request("PUT", "/setup/practice", json={"name": "Harbor Kids", "state": "CA"})

    terms_only = await api.post("/setup/agreements", json={
        "accepted": all_documents(owner=False), "authorized_to_sign": True,
    })
    assert terms_only.status_code == 400
    not_authorized = await api.post("/setup/agreements", json={"accepted": all_documents(owner=True)})
    assert not_authorized.status_code == 400


async def test_an_old_version_of_an_agreement_is_not_accepted(api, db):
    await new_colleague(api, db)
    await api.request("PUT", "/setup/details", json={"name": "Sam Rivera"})

    r = await api.post("/setup/agreements", json={
        "accepted": [{"document": "terms", "version": "some-older-version"}],
    })
    assert r.status_code == 400


async def test_the_owner_is_the_practice_admin(api, db):
    user, org = await new_owner(api, db)
    await api.request("PUT", "/setup/details", json={"name": "Dana Lee"})
    await api.request("PUT", "/setup/practice", json={"name": "Harbor Kids", "state": "CA"})
    await api.post("/setup/agreements", json={"accepted": all_documents(owner=True), "authorized_to_sign": True})

    assert (await api.get("/practitioners/me")).json()["is_org_admin"] is True


async def test_a_suspended_practice_is_refused(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    org.status = "suspended"
    await db.flush()

    api.sign_in_as(me.user)
    r = await api.get("/patients")
    assert r.status_code == 403
    assert r.json()["detail"] == "practice_not_active"


async def test_setup_screens_are_closed_once_setup_is_done(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/setup/details", json={"name": "Changed"})
    assert r.status_code == 409


async def test_a_removed_account_cannot_sign_in(api, db):
    from app.core.security import hash_password
    org = await make_org(db)
    me = await make_practitioner(db, org)
    me.user.email = "removed-account@example.com"
    me.user.password_hash = hash_password("a-good-password")
    me.user.deactivated_at = datetime.now(timezone.utc)
    await db.flush()

    r = await api.post("/auth/login", json={"email": "removed-account@example.com", "password": "a-good-password"})
    assert r.status_code == 401


async def test_auth_me_says_whether_setup_is_done(api, db):
    await new_colleague(api, db)

    body = (await api.get("/auth/me")).json()
    assert body["setup_complete"] is False
    assert body["is_practitioner"] is True
    assert body["is_practice_manager"] is False
