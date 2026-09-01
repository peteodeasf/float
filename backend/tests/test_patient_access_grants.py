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
    await grant_patient_to(db, plan.patient, owner, owner=True)

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
    await grant_patient_to(db, plan.patient, owner, owner=True)
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
    """Otherwise a patient ends up with nobody who can open them.

    Reached here through a patient with no owner — a legacy row, since every patient created since
    2026-08-28 gets one. With an owner the rule below fires first, because the owner always holds a
    grant and their access cannot be taken away.
    """
    org = await make_org(db)
    plan = await make_plan(db, org)
    only_one = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, only_one)
    admin = await make_org_admin(db, org)
    assert plan.patient.primary_practitioner_id is None

    api.sign_in_as(admin.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{only_one.id}")

    assert r.status_code == 409


async def test_revoking_works_when_someone_else_still_has_access(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    first = await make_practitioner(db, org)
    second = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, first, owner=True)
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


# ── Who else works here ──────────────────────────────────────────────────────
#
# Handing a patient over needs a practitioner id, and until now nothing returned one, so access
# could only be changed in the database. GET /practitioners is that list.


async def test_colleagues_are_my_institution_and_only_my_institution(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Me")
    colleague = await make_practitioner(db, org, name="My Colleague")

    other_org = await make_org(db)
    await make_practitioner(db, other_org, name="Someone Elsewhere")

    api.sign_in_as(me.user)
    r = await api.get("/practitioners")

    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "My Colleague" in names
    assert "Someone Elsewhere" not in names
    assert {str(me.id), str(colleague.id)} == {c["id"] for c in r.json()}


async def test_colleagues_marks_which_one_is_me(api, db):
    """The screen needs it: you cannot revoke your own way in from your own patient page."""
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Me")
    await make_practitioner(db, org, name="Someone Else")

    api.sign_in_as(me.user)
    r = await api.get("/practitioners")

    mine = [c for c in r.json() if c["is_me"]]
    assert [c["id"] for c in mine] == [str(me.id)]


async def test_colleagues_marks_an_institution_admin(api, db):
    """An admin can open every patient here without a grant, so the screen has to say so rather
    than showing them as someone who needs granting."""
    org = await make_org(db)
    me = await make_practitioner(db, org, name="Me")
    admin = await make_org_admin(db, org)

    api.sign_in_as(me.user)
    r = await api.get("/practitioners")

    by_id = {c["id"]: c for c in r.json()}
    assert by_id[str(admin.id)]["is_org_admin"] is True
    assert by_id[str(me.id)]["is_org_admin"] is False


async def test_a_child_cannot_read_the_list_of_clinicians(api, db):
    org = await make_org(db)
    await make_practitioner(db, org, name="Me")
    patient = await make_patient(db, org)

    api.sign_in_as(patient.user)
    r = await api.get("/practitioners")

    assert r.status_code in (403, 404)


# ── The patient has an owner ─────────────────────────────────────────────────
#
# Peter, 2026-09-01: "you give a colleague access to cover for you, and they can take away yours -
# i think no. that can't happen by default. if there's an owner of the patient, it is the initial
# therapist."
#
# So a covering colleague can do the clinical work and can see who else has access, and can change
# none of it. Only the owner or a clinic admin can. The owner's own access is not revocable at all,
# which is why ownership can be handed over.


async def test_a_covering_colleague_cannot_give_anyone_else_access(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    covering = await make_practitioner(db, org)
    outsider_to_the_case = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, covering)

    api.sign_in_as(covering.user)
    # They can open the patient — this is not about the clinical work.
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200

    r = await api.post(f"/patients/{plan.patient.id}/access",
                       json={"practitioner_id": str(outsider_to_the_case.id)})
    assert r.status_code == 403


async def test_a_covering_colleague_cannot_remove_the_owner(api, db):
    """The case Peter rejected outright."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    covering = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, covering)

    api.sign_in_as(covering.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{owner.id}")
    assert r.status_code == 403

    api.sign_in_as(owner.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200


async def test_a_covering_colleague_cannot_remove_another_colleague_either(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    covering = await make_practitioner(db, org)
    also_covering = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, covering)
    await grant_patient_to(db, plan.patient, also_covering)

    api.sign_in_as(covering.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{also_covering.id}")
    assert r.status_code == 403


async def test_not_even_an_admin_can_revoke_the_owners_access(api, db):
    """Not a refusal to help — it would leave the patient pointing at a clinician who cannot open
    them. The admin hands the patient over first, which the next test does."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    other = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, other)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    r = await api.request("DELETE", f"/patients/{plan.patient.id}/access/{owner.id}")
    assert r.status_code == 409


async def test_an_admin_hands_the_patient_over_and_then_removes_the_old_clinician(api, db):
    """A therapist leaving the clinic, which is the reason this has to be possible at all."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    leaving = await make_practitioner(db, org)
    taking_over = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, leaving, owner=True)
    await grant_patient_to(db, plan.patient, taking_over)
    admin = await make_org_admin(db, org)

    api.sign_in_as(admin.user)
    assert (await api.request(
        "PUT", f"/patients/{plan.patient.id}/owner",
        json={"practitioner_id": str(taking_over.id)})).status_code == 204
    assert (await api.request(
        "DELETE", f"/patients/{plan.patient.id}/access/{leaving.id}")).status_code == 204

    api.sign_in_as(leaving.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 404
    api.sign_in_as(taking_over.user)
    assert (await api.get(f"/patients/{plan.patient.id}")).status_code == 200


async def test_the_owner_can_hand_the_patient_over_themselves(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    taking_over = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, taking_over)

    api.sign_in_as(owner.user)
    r = await api.request("PUT", f"/patients/{plan.patient.id}/owner",
                          json={"practitioner_id": str(taking_over.id)})
    assert r.status_code == 204

    # And now the handover has flipped who is in charge: the old owner can be removed, and cannot
    # take the patient back.
    api.sign_in_as(taking_over.user)
    assert (await api.request(
        "DELETE", f"/patients/{plan.patient.id}/access/{owner.id}")).status_code == 204


async def test_a_covering_colleague_cannot_make_themselves_the_owner(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    covering = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, covering)

    api.sign_in_as(covering.user)
    r = await api.request("PUT", f"/patients/{plan.patient.id}/owner",
                          json={"practitioner_id": str(covering.id)})
    assert r.status_code == 403


async def test_cannot_hand_the_patient_to_someone_who_has_no_access(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    stranger = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)

    api.sign_in_as(owner.user)
    r = await api.request("PUT", f"/patients/{plan.patient.id}/owner",
                          json={"practitioner_id": str(stranger.id)})
    assert r.status_code == 409


async def test_cannot_hand_the_patient_to_another_institution(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    outsider = await make_practitioner(db, await make_org(db))

    api.sign_in_as(owner.user)
    r = await api.request("PUT", f"/patients/{plan.patient.id}/owner",
                          json={"practitioner_id": str(outsider.id)})
    assert r.status_code == 404


async def test_the_access_list_says_who_owns_the_patient_and_who_may_change_it(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    owner = await make_practitioner(db, org)
    covering = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, owner, owner=True)
    await grant_patient_to(db, plan.patient, covering)

    api.sign_in_as(owner.user)
    body = (await api.get(f"/patients/{plan.patient.id}/access")).json()
    assert body["can_manage"] is True
    by_id = {g["practitioner_id"]: g for g in body["grants"]}
    assert by_id[str(owner.id)]["is_owner"] is True
    assert by_id[str(covering.id)]["is_owner"] is False

    api.sign_in_as(covering.user)
    body = (await api.get(f"/patients/{plan.patient.id}/access")).json()
    assert body["can_manage"] is False
    assert len(body["grants"]) == 2
