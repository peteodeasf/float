"""Two parents on one child: the clinician's list, inviting, and removing.
docs/plans/two-parent-accounts.md
"""
import uuid

from sqlalchemy import select

from app.models.patient import ParentPatientLink
from app.models.user import User
from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner


async def _clinic(db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    return org, child, clinician


async def _invite(api, child, email):
    r = await api.post(f"/patients/{child.id}/invite-parent", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_child_can_have_two_parents_and_the_clinician_sees_both(api, db):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)

    await _invite(api, child, "mum@example.com")
    await _invite(api, child, "dad@example.com")

    parents = (await api.get(f"/patients/{child.id}/parents")).json()
    assert [p["email"] for p in parents] == ["mum@example.com", "dad@example.com"]
    assert all(p["has_signed_in"] is False for p in parents)
    assert all(p["reminder_emails_off"] is False for p in parents)


async def test_inviting_the_same_parent_again_does_not_reset_their_password(api, db):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    await _invite(api, child, "mum@example.com")

    parent = (await db.execute(select(User).where(User.email == "mum@example.com"))).scalar_one()
    # They have signed in and chosen their own password.
    parent.password_hash = "their-own-password"
    parent.must_change_password = False
    await db.flush()

    again = await _invite(api, child, "MUM@example.com")
    assert again["already_a_parent"] is True

    await db.refresh(parent)
    assert parent.password_hash == "their-own-password"
    assert parent.must_change_password is False


async def test_a_parent_can_be_removed_and_keeps_nothing_but_the_link(api, db):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    await _invite(api, child, "mum@example.com")
    await _invite(api, child, "dad@example.com")
    dad = (await db.execute(select(User).where(User.email == "dad@example.com"))).scalar_one()

    assert (await api.delete(f"/patients/{child.id}/parents/{dad.id}")).status_code == 204

    parents = (await api.get(f"/patients/{child.id}/parents")).json()
    assert [p["email"] for p in parents] == ["mum@example.com"]
    # The parent's own account is untouched; only the link to this child is gone.
    assert (await db.execute(select(User).where(User.id == dad.id))).scalar_one_or_none() is not None
    links = (await db.execute(select(ParentPatientLink).where(ParentPatientLink.patient_id == child.id))).scalars().all()
    assert len(links) == 1


async def test_removing_someone_who_is_not_a_parent_is_a_404(api, db):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    assert (await api.delete(f"/patients/{child.id}/parents/{uuid.uuid4()}")).status_code == 404


# ── A thread each ─────────────────────────────────────────────────────────────

async def _parent_user(db, email):
    return (await db.execute(select(User).where(User.email == email))).scalar_one()


async def test_each_parent_has_their_own_thread_with_the_clinician(api, db):
    _, child, clinician = await _clinic(db)
    child.primary_practitioner_id = clinician.id
    await db.flush()
    api.sign_in_as(clinician.user)
    await _invite(api, child, "mum@example.com")
    await _invite(api, child, "dad@example.com")
    mum, dad = await _parent_user(db, "mum@example.com"), await _parent_user(db, "dad@example.com")

    for parent, text in ((mum, "How was bedtime?"), (dad, "Can you take Tuesday?")):
        r = await api.post(f"/patients/{child.id}/parents/{parent.id}/messages",
                           json={"content": text})
        assert r.status_code == 201, r.text

    mums = (await api.get(f"/patients/{child.id}/parents/{mum.id}/messages")).json()
    assert [m["content"] for m in mums] == ["How was bedtime?"]
    dads = (await api.get(f"/patients/{child.id}/parents/{dad.id}/messages")).json()
    assert [m["content"] for m in dads] == ["Can you take Tuesday?"]

    # Each parent sees only their own, and can mark their own read.
    api.sign_in_as(mum)
    mine = (await api.get("/parent/messages")).json()
    assert [m["content"] for m in mine] == ["How was bedtime?"]
    assert (await api.put(f"/parent/messages/{mine[0]['id']}/read")).status_code == 200

    api.sign_in_as(dad)
    theirs = (await api.get("/parent/messages")).json()
    assert [m["content"] for m in theirs] == ["Can you take Tuesday?"]

    # A reply from one parent reaches the clinician in that parent's thread only.
    assert (await api.post("/parent/messages", json={"content": "Tuesday works"})).status_code == 201
    api.sign_in_as(clinician.user)
    dads = (await api.get(f"/patients/{child.id}/parents/{dad.id}/messages")).json()
    assert [m["content"] for m in dads] == ["Can you take Tuesday?", "Tuesday works"]
    mums = (await api.get(f"/patients/{child.id}/parents/{mum.id}/messages")).json()
    assert [m["content"] for m in mums] == ["How was bedtime?"]


async def test_a_message_cannot_be_sent_to_someone_who_is_not_a_parent(api, db):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    r = await api.post(f"/patients/{child.id}/parents/{uuid.uuid4()}/messages", json={"content": "hi"})
    assert r.status_code == 400
