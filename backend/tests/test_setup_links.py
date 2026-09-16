"""Setup links: a new clinician chooses their own password from a one-time emailed link.

Replaces emailing a temporary password. docs/plans/clinician-practice-onboarding.md
"""
import re
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core.security import verify_password
from app.models.setup_link import SetupLink
from app.models.user import User

from tests.factories import _make_user, make_org, make_practitioner


@pytest.fixture(autouse=True)
def email_configured(monkeypatch):
    # So the email is built and captured by no_outbound, whatever .env holds.
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")


def token_from(email_payload) -> str:
    return re.search(r"/setup#token=([\w-]+)", email_payload["text"]).group(1)


async def invite_clinician(api, db, no_outbound, email="new.clinician@example.com"):
    """Returns the created clinician, the token from their email, and the Float admin who sent it."""
    org = await make_org(db)
    admin = await _make_user(db, org, "admin")  # a Float admin
    api.sign_in_as(admin)
    r = await api.post("/admin/clinicians", json={
        "name": "New Clinician", "email": email, "organization_id": str(org.id),
    })
    assert r.status_code == 200, r.text
    api.sign_in_as(None)
    return r.json(), token_from(no_outbound["email"][-1]), admin


async def test_the_invite_email_has_a_link_and_no_password(api, db, no_outbound):
    await invite_clinician(api, db, no_outbound)

    email = no_outbound["email"][-1]
    assert "/setup#token=" in email["text"]
    assert "password:" not in email["text"].lower()


async def test_the_database_keeps_only_a_hash_of_the_token(api, db, no_outbound):
    created, token, _ = await invite_clinician(api, db, no_outbound)

    link = (await db.execute(
        SetupLink.__table__.select().where(SetupLink.user_id == created["user_id"])
    )).one()
    assert token not in link.token_hash


async def test_the_new_clinician_cannot_sign_in_before_choosing_a_password(api, db, no_outbound):
    created, _, _ = await invite_clinician(api, db, no_outbound)

    r = await api.post("/auth/login", json={"email": created["email"], "password": "any-guess"})
    assert r.status_code == 401


async def test_the_link_shows_who_it_is_for(api, db, no_outbound):
    created, token, _ = await invite_clinician(api, db, no_outbound)

    r = await api.post("/auth/setup-link/check", json={"token": token})
    assert r.status_code == 200
    assert r.json()["email"] == created["email"]


async def test_choosing_a_password_lets_them_sign_in(api, db, no_outbound):
    created, token, _ = await invite_clinician(api, db, no_outbound)

    r = await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})
    assert r.status_code == 200

    r = await api.post("/auth/login", json={"email": created["email"], "password": "a-good-password"})
    assert r.status_code == 200


async def test_a_link_works_once(api, db, no_outbound):
    _, token, _ = await invite_clinician(api, db, no_outbound)

    await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})
    r = await api.post("/auth/setup-link/complete", json={"token": token, "password": "someone-elses"})

    assert r.status_code == 404
    assert (await api.post("/auth/setup-link/check", json={"token": token})).status_code == 404


async def test_an_expired_link_does_not_work(api, db, no_outbound):
    created, token, _ = await invite_clinician(api, db, no_outbound)
    await db.execute(
        SetupLink.__table__.update()
        .where(SetupLink.user_id == created["user_id"])
        .values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    )

    r = await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})
    assert r.status_code == 404


async def test_a_short_password_is_refused_and_the_link_still_works(api, db, no_outbound):
    _, token, _ = await invite_clinician(api, db, no_outbound)

    r = await api.post("/auth/setup-link/complete", json={"token": token, "password": "short"})
    assert r.status_code == 400
    assert (await api.post("/auth/setup-link/check", json={"token": token})).status_code == 200


async def test_a_made_up_token_does_not_work(api, db, no_outbound):
    await invite_clinician(api, db, no_outbound)

    r = await api.post("/auth/setup-link/check", json={"token": "not-a-real-token"})
    assert r.status_code == 404


async def test_resending_makes_the_old_link_stop_working(api, db, no_outbound):
    created, old_token, admin = await invite_clinician(api, db, no_outbound)

    api.sign_in_as(admin)
    r = await api.post(f"/admin/clinicians/{created['user_id']}/setup-link")
    assert r.status_code == 200
    new_token = token_from(no_outbound["email"][-1])
    api.sign_in_as(None)

    assert new_token != old_token
    assert (await api.post("/auth/setup-link/check", json={"token": old_token})).status_code == 404
    assert (await api.post("/auth/setup-link/check", json={"token": new_token})).status_code == 200


async def test_no_resend_once_they_have_a_password(api, db, no_outbound):
    created, token, admin = await invite_clinician(api, db, no_outbound)
    await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})

    api.sign_in_as(admin)
    r = await api.post(f"/admin/clinicians/{created['user_id']}/setup-link")
    assert r.status_code == 409


async def test_only_a_float_admin_can_resend(api, db, no_outbound):
    created, _, _ = await invite_clinician(api, db, no_outbound)
    org = await make_org(db)

    api.sign_in_as((await make_practitioner(db, org)).user)
    r = await api.post(f"/admin/clinicians/{created['user_id']}/setup-link")
    assert r.status_code == 403


async def test_completing_a_link_records_when_the_password_was_chosen(api, db, no_outbound):
    """That time is what refuses any session token issued before it."""
    created, token, _ = await invite_clinician(api, db, no_outbound)

    await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})

    user = await db.get(User, created["user_id"])
    await db.refresh(user)
    assert user.password_changed_at is not None
    assert verify_password("a-good-password", user.password_hash)


async def test_the_admin_list_offers_a_setup_link_only_to_clinicians_sent_one(api, db, no_outbound):
    created, token, admin = await invite_clinician(api, db, no_outbound)
    # Made before setup links existed: no link, no recorded password change.
    older = await make_practitioner(db, await make_org(db))

    api.sign_in_as(admin)
    users = {u["id"]: u for u in (await api.get("/admin/users")).json()}
    assert users[created["user_id"]]["awaiting_setup"] is True
    assert users[str(older.user.id)]["awaiting_setup"] is False

    await api.post("/auth/setup-link/complete", json={"token": token, "password": "a-good-password"})
    users = {u["id"]: u for u in (await api.get("/admin/users")).json()}
    assert users[created["user_id"]]["awaiting_setup"] is False
