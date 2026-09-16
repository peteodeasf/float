"""An invite must never take over someone else's account.

Before this, inviting a child or a parent with an email that already had a Float account reset that
account's password and linked it to the clinician's patient, whoever the account belonged to: a
clinician in another practice, an office manager, a Float admin. The refusal must also not say whose
the email is or name any patient.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.patient import ParentPatientLink
from app.models.user import User, UserRole

from tests.factories import _make_user, grant_patient_to, make_float_admin, make_org, make_patient, make_practitioner


pytestmark = pytest.mark.usefixtures("email_configured")


async def clinic_with_consent(db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    child.child_connect_consent_at = datetime.now(timezone.utc)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    return org, child, clinician


async def with_real_email(db, user: User) -> User:
    user.email = f"someone-{uuid.uuid4().hex[:8]}@example.com"
    user.password_hash = "their-real-password-hash"
    await db.flush()
    return user


# ── Child invite ──

async def test_a_child_invite_cannot_use_another_practices_clinician(api, db, no_outbound):
    _, child, clinician = await clinic_with_consent(db)
    victim = await with_real_email(db, (await make_practitioner(db, await make_org(db))).user)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-teen", json={"email": victim.email})

    assert r.status_code == 409
    await db.refresh(victim)
    assert victim.password_hash == "their-real-password-hash"
    await db.refresh(child)
    assert child.user_id != victim.id
    assert no_outbound["email"] == []


async def test_a_child_invite_cannot_use_a_float_admin(api, db):
    _, child, clinician = await clinic_with_consent(db)
    admin = await with_real_email(db, await make_float_admin(db))
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-teen", json={"email": admin.email})

    assert r.status_code == 409
    await db.refresh(admin)
    assert admin.password_hash == "their-real-password-hash"
    roles = (await db.execute(select(UserRole.role).where(UserRole.user_id == admin.id))).scalars().all()
    assert roles == ["admin"]


async def test_a_child_invite_cannot_use_another_childs_login_and_names_no_one(api, db):
    org, child, clinician = await clinic_with_consent(db)
    other_child = await make_patient(db, org, name="Casey Other")
    await with_real_email(db, other_child.user)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-teen", json={"email": other_child.user.email})

    assert r.status_code == 409
    assert "Casey" not in r.text
    assert other_child.user.email not in r.text


async def test_the_childs_own_login_can_still_be_invited_again(api, db):
    _, child, clinician = await clinic_with_consent(db)
    await with_real_email(db, child.user)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-teen", json={"email": child.user.email})

    assert r.status_code == 200, r.text


async def test_a_new_email_still_creates_the_childs_login(api, db):
    _, child, clinician = await clinic_with_consent(db)
    api.sign_in_as(clinician.user)

    email = f"new-child-{uuid.uuid4().hex[:8]}@example.com"
    r = await api.post(f"/patients/{child.id}/invite-teen", json={"email": email})

    assert r.status_code == 200, r.text
    await db.refresh(child)
    assert (await db.get(User, child.user_id)).email == email


# ── Parent invite ──

async def test_a_parent_invite_cannot_use_a_clinician(api, db, no_outbound):
    org, child, clinician = await clinic_with_consent(db)
    colleague = await with_real_email(db, (await make_practitioner(db, org)).user)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-parent", json={"email": colleague.email})

    assert r.status_code == 409
    await db.refresh(colleague)
    assert colleague.password_hash == "their-real-password-hash"
    links = (await db.execute(select(ParentPatientLink).where(ParentPatientLink.parent_user_id == colleague.id))).all()
    assert links == []
    assert no_outbound["email"] == []


async def test_a_parent_invite_cannot_use_a_parent_from_another_practice(api, db):
    _, child, clinician = await clinic_with_consent(db)
    elsewhere = await with_real_email(db, await _make_user(db, await make_org(db), "parent"))
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-parent", json={"email": elsewhere.email})

    assert r.status_code == 409
    await db.refresh(elsewhere)
    assert elsewhere.password_hash == "their-real-password-hash"


async def test_a_parent_invite_cannot_use_a_child_login(api, db):
    org, child, clinician = await clinic_with_consent(db)
    other_child = await make_patient(db, org)
    await with_real_email(db, other_child.user)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-parent", json={"email": other_child.user.email})

    assert r.status_code == 409


async def test_a_parent_of_a_sibling_in_this_practice_is_linked_and_keeps_their_password(api, db, no_outbound):
    org, child, clinician = await clinic_with_consent(db)
    parent = await with_real_email(db, await _make_user(db, org, "parent"))
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{child.id}/invite-parent", json={"email": parent.email})

    assert r.status_code == 200, r.text
    await db.refresh(parent)
    assert parent.password_hash == "their-real-password-hash"
    link = (await db.execute(select(ParentPatientLink).where(
        ParentPatientLink.parent_user_id == parent.id, ParentPatientLink.patient_id == child.id,
    ))).scalar_one_or_none()
    assert link is not None
    email = no_outbound["email"][-1]
    assert "Temporary password" not in email["text"]
    assert "the password you already use" in email["text"]
