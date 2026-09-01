"""A clinician's own details, and changing their own password.

Both routes act on the caller and take no id, so there is no target to get wrong — which is the
point. These prove the caller really is the only thing they touch, and that changing a password
from a live session still needs the password you already have.

Plan: docs/plans/clinician-settings.md ("Your account").
"""
from app.core.security import hash_password, verify_password

from tests.factories import make_org, make_org_admin, make_patient, make_practitioner


async def test_i_can_read_my_own_details(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Alex Chen")
    me.credentials = "PsyD"
    me.phone_number = "555-0100"
    await db.flush()

    api.sign_in_as(me.user)
    r = await api.get("/practitioners/me")

    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Alex Chen"
    assert body["credentials"] == "PsyD"
    assert body["phone_number"] == "555-0100"
    assert body["email"] == me.user.email
    assert body["is_org_admin"] is False


async def test_the_route_returns_me_and_not_whoever_else_is_here(api, db):
    """There is no id in the path, so this is the whole boundary."""
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Alex Chen")
    await make_practitioner(db, org, name="Someone Else")

    api.sign_in_as(me.user)
    body = (await api.get("/practitioners/me")).json()

    assert body["id"] == str(me.id)
    assert body["name"] == "Alex Chen"


async def test_an_admin_is_told_they_are_one(api, db):
    org = await make_org(db)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    assert (await api.get("/practitioners/me")).json()["is_org_admin"] is True


async def test_i_can_change_my_name_credentials_and_phone(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Alex Chen")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/practitioners/me", json={
        "name": "Alex Chen-Ramirez",
        "credentials": "PsyD, ABPP",
        "phone_number": "555-0199",
    })

    assert r.status_code == 200
    assert r.json()["name"] == "Alex Chen-Ramirez"
    assert (await api.get("/practitioners/me")).json()["credentials"] == "PsyD, ABPP"


async def test_clearing_credentials_and_phone_stores_nothing_rather_than_an_empty_string(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Alex Chen")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/practitioners/me", json={
        "name": "Alex Chen", "credentials": "  ", "phone_number": "",
    })

    assert r.json()["credentials"] is None
    assert r.json()["phone_number"] is None


async def test_my_name_cannot_be_blanked(api, db):
    """It shows on the patient page and on a treatment plan."""
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Alex Chen")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/practitioners/me", json={"name": "   "})

    assert r.status_code == 400
    assert (await api.get("/practitioners/me")).json()["name"] == "Alex Chen"


async def test_a_child_has_no_practitioner_profile_to_read(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)

    api.sign_in_as(patient.user)
    assert (await api.get("/practitioners/me")).status_code in (403, 404)


# ── Changing my password while signed in ─────────────────────────────────────


async def _with_password(db, practitioner, password: str):
    practitioner.user.password_hash = hash_password(password)
    await db.flush()
    return practitioner


async def test_changing_my_password_needs_the_one_i_have(api, db):
    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "a-longer-new-one",
    })

    assert r.status_code == 200
    await db.refresh(me.user)
    assert verify_password("a-longer-new-one", me.user.password_hash)


async def test_the_wrong_current_password_is_refused(api, db):
    """A live session is not enough on its own — otherwise a borrowed unlocked laptop locks the
    real clinician out of their own account."""
    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/change-password", json={
        "current_password": "not-it", "new_password": "a-longer-new-one",
    })

    assert r.status_code == 400
    await db.refresh(me.user)
    assert verify_password("old-password", me.user.password_hash)


async def test_a_short_new_password_is_refused(api, db):
    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "short",
    })

    assert r.status_code == 400
    await db.refresh(me.user)
    assert verify_password("old-password", me.user.password_hash)


async def test_reusing_the_same_password_is_refused(api, db):
    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "old-password",
    })

    assert r.status_code == 400


# ── Changing a password ends every other session ─────────────────────────────
#
# Refresh tokens are stateless and last a week. Before this, changing a password left a session
# someone else already had working for the rest of that week — which is the one situation a person
# changes their password for. Tokens now carry when they were issued, and anything older than the
# user's last password change is refused.


async def test_a_session_from_before_the_change_stops_working(api, db):
    from app.core.security import create_access_token

    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")
    stolen = create_access_token(subject=str(me.user.id))

    # It works right now.
    api.sign_in_with_token(stolen)
    assert (await api.get("/practitioners/me")).status_code == 200

    api.sign_in_as(me.user)
    assert (await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "a-longer-new-one",
    })).status_code == 200

    api.sign_in_with_token(stolen)
    assert (await api.get("/practitioners/me")).status_code == 401


async def test_a_refresh_token_from_before_the_change_stops_working(api, db):
    """The one that matters: an access token dies in half an hour anyway, a refresh token lasts a
    week and can mint new access tokens the whole time."""
    from app.core.security import create_refresh_token

    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")
    stolen = create_refresh_token(subject=str(me.user.id))

    assert (await api.post("/auth/refresh", json={"refresh_token": stolen})).status_code == 200

    api.sign_in_as(me.user)
    assert (await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "a-longer-new-one",
    })).status_code == 200

    r = await api.post("/auth/refresh", json={"refresh_token": stolen})
    assert r.status_code == 401


async def test_the_person_changing_it_is_handed_a_working_session_back(api, db):
    """Otherwise changing your own password signs you out of the browser you did it in."""
    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "a-longer-new-one",
    })
    assert r.status_code == 200
    body = r.json()

    api.sign_in_with_token(body["access_token"])
    assert (await api.get("/practitioners/me")).status_code == 200
    assert (await api.post(
        "/auth/refresh", json={"refresh_token": body["refresh_token"]})).status_code == 200


async def test_a_session_predating_the_check_is_refused_once_they_change_it(api, db):
    """Tokens minted before this shipped carry no issue time. Refusing them costs one sign-in;
    letting them through would leave exactly the stolen session this is meant to kill."""
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from app.core.config import settings

    org = await make_org(db)
    me = await _with_password(db, await make_practitioner(db, org), "old-password")
    old_style = jwt.encode(
        {"sub": str(me.user.id),
         "exp": datetime.now(timezone.utc) + timedelta(days=1),
         "type": "access"},
        settings.SECRET_KEY, algorithm="HS256",
    )

    api.sign_in_with_token(old_style)
    assert (await api.get("/practitioners/me")).status_code == 200

    api.sign_in_as(me.user)
    await api.request("PUT", "/auth/change-password", json={
        "current_password": "old-password", "new_password": "a-longer-new-one",
    })

    api.sign_in_with_token(old_style)
    assert (await api.get("/practitioners/me")).status_code == 401


async def test_nobody_is_signed_out_who_has_never_changed_their_password(api, db):
    """Fail closed on a stale token, but do not fail closed on everyone."""
    org = await make_org(db)
    me = await make_practitioner(db, org)

    api.sign_in_as(me.user)
    assert me.user.password_changed_at is None
    assert (await api.get("/practitioners/me")).status_code == 200


async def test_setting_a_first_password_also_ends_older_sessions(api, db):
    """The temporary password Float emails out. If someone else used it first, the child setting a
    real password has to be what stops them — same rule as changing one later."""
    from app.core.security import create_access_token

    org = await make_org(db)
    me = await make_practitioner(db, org)
    older = create_access_token(subject=str(me.user.id))

    api.sign_in_with_token(older)
    assert (await api.get("/practitioners/me")).status_code == 200

    api.sign_in_as(me.user)
    r = await api.request("PUT", "/auth/set-password", json={"password": "chosen-by-them"})
    assert r.status_code == 200

    api.sign_in_with_token(older)
    assert (await api.get("/practitioners/me")).status_code == 401

    # And whoever set it keeps working.
    api.sign_in_with_token(r.json()["access_token"])
    assert (await api.get("/practitioners/me")).status_code == 200
