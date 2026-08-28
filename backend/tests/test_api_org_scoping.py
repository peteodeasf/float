"""Organisation scoping, through the API.

Non-negotiable #2: separation between parent, child and clinician data is a hard boundary. These
tests go through the real routes — routing, auth dependency, status codes — rather than calling
services directly, because a missing permission check lives in the router, not the service.

A clinician from organisation B must not be able to read, change or delete organisation A's data,
and an anonymous request must not get in at all.

Observed contract (probed 2026-08-26): cross-organisation READS return 200 with an empty list,
because every query filters on organization_id; cross-organisation WRITES return 404. The status
assertions below stay permissive on purpose — 403 vs 404 is not worth freezing — but the data
assertions are strict, and those are what actually catch a leak.
"""
from sqlalchemy import select

from app.models.treatment import TriggerSituation, AvoidanceBehavior
from tests.factories import (
    make_org, make_plan, make_practitioner, make_situation, make_rung, grant_patient_to,
)


async def test_anonymous_request_is_rejected(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    s = await make_situation(db, plan)

    r = await api.get(f"/plans/{plan.id}/triggers")
    assert r.status_code == 401


async def test_clinician_sees_their_own_organisations_situations(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    await make_situation(db, plan, name="Attending school")
    clinician = await make_practitioner(db, org)
    # Being in the institution is no longer enough on its own — see
    # docs/plans/clinician-patient-access-grants.md. The grant is what makes this 200.
    await grant_patient_to(db, plan.patient, clinician)

    api.sign_in_as(clinician.user)
    r = await api.get(f"/plans/{plan.id}/triggers")

    assert r.status_code == 200
    assert [t["name"] for t in r.json()] == ["Attending school"]


async def test_clinician_cannot_read_another_organisations_situations(api, db):
    org_a = await make_org(db)
    plan_a = await make_plan(db, org_a)
    await make_situation(db, plan_a, name="Private to org A")

    org_b = await make_org(db)
    intruder = await make_practitioner(db, org_b)

    api.sign_in_as(intruder.user)
    r = await api.get(f"/plans/{plan_a.id}/triggers")

    # Either refused outright or filtered to nothing — never org A's data.
    assert r.status_code in (200, 403, 404)
    if r.status_code == 200:
        assert r.json() == [], "leaked another organisation's situations"


async def test_clinician_cannot_delete_another_organisations_situation(api, db):
    org_a = await make_org(db)
    plan_a = await make_plan(db, org_a)
    s = await make_situation(db, plan_a)

    org_b = await make_org(db)
    intruder = await make_practitioner(db, org_b)

    api.sign_in_as(intruder.user)
    r = await api.delete(f"/plans/{plan_a.id}/triggers/{s.id}")

    assert r.status_code in (403, 404)
    still_there = (await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == s.id)
    )).scalar_one_or_none()
    assert still_there is not None, "another organisation deleted this situation"


async def test_clinician_cannot_read_another_organisations_ladder(api, db):
    org_a = await make_org(db)
    plan_a = await make_plan(db, org_a)
    s = await make_situation(db, plan_a)
    await make_rung(db, situation=s, name="private rung")

    org_b = await make_org(db)
    intruder = await make_practitioner(db, org_b)

    api.sign_in_as(intruder.user)
    r = await api.get(f"/plans/{plan_a.id}/rungs")

    assert r.status_code in (200, 403, 404)
    if r.status_code == 200:
        assert r.json() == [], "leaked another organisation's ladder"


async def test_clinician_cannot_regroup_another_organisations_rung(api, db):
    """Writes matter as much as reads — a cross-organisation edit must not land."""
    org_a = await make_org(db)
    plan_a = await make_plan(db, org_a)
    s = await make_situation(db, plan_a)
    rung = await make_rung(db, situation=s, name="untouched")

    org_b = await make_org(db)
    intruder = await make_practitioner(db, org_b)

    api.sign_in_as(intruder.user)
    r = await api.put(f"/plans/{plan_a.id}/rungs/{rung.id}", json={"name": "hacked"})

    assert r.status_code in (403, 404)
    await db.refresh(rung)
    assert rung.name == "untouched"


async def test_a_user_without_a_practitioner_profile_is_refused(api, db):
    """get_practitioner_context raises 403 — the real dependency runs, it is not stubbed out."""
    from tests.factories import _make_user

    org = await make_org(db)
    plan = await make_plan(db, org)
    stranger = await _make_user(db, org, "patient")

    api.sign_in_as(stranger)
    r = await api.get(f"/plans/{plan.id}/triggers")

    assert r.status_code == 403
