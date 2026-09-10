"""The parent names their accommodations; the clinician adds what to work on.

Peter, 2026-09-10: nothing the parent says goes straight onto the treatment plan.
Plan: docs/plans/accommodation-conversation.md
"""
import uuid

from sqlalchemy import select

from app.models.experiment import AccommodationBehavior
from app.models.insight import KIND_ACCOMMODATION, KIND_SITUATION
from app.services.insight_service import _existing, upsert_insight

from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_situation
from tests.test_role_boundary import _parent_of


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    plan = await make_plan(db, org, patient=child)
    situation = await make_situation(db, plan, name="Bedtime")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)

    # What the monitoring log already says: the situation, on the plan, and one accommodation.
    existing = await _existing(db, child.id)
    sit = await upsert_insight(db, patient_id=child.id, organization_id=org.id, kind=KIND_SITUATION,
                               name="Bedtime", monitoring_entry_ids=[uuid.uuid4()], existing=existing)
    sit.trigger_situation_id = situation.id
    logged = await upsert_insight(db, patient_id=child.id, organization_id=org.id,
                                  kind=KIND_ACCOMMODATION, name="Lies down with them until asleep",
                                  parent=sit, monitoring_entry_ids=[uuid.uuid4()], existing=existing)
    await db.flush()
    return dict(org=org, child=child, plan=plan, situation=situation, clinician=clinician,
                parent=parent, logged=logged)


async def _suggestions(api, f):
    api.sign_in_as(f["clinician"].user)
    r = await api.get(f"/patients/{f['child'].id}/insights?kind=accommodation")
    assert r.status_code == 200, r.text
    return {s["name"]: s for s in r.json()}


async def test_the_parent_sees_each_situation_with_what_they_already_wrote(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])

    r = await api.get("/parent/accommodation-conversation")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["child_name"] == "Sam"
    [sit] = body["situations"]
    assert sit["name"] == "Bedtime"
    assert [(i["name"], i["from_record"], i["still_does"]) for i in sit["items"]] == [
        ("Lies down with them until asleep", True, None)]


async def test_they_keep_one_and_estimate_it_and_the_clinician_sees_it(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    r = await api.put(f"/parent/accommodation-suggestions/{f['logged'].id}",
                      json={"still_does": True, "estimate_min": 5, "estimate_max": 9})
    assert r.status_code == 200, r.text

    s = (await _suggestions(api, f))["Lies down with them until asleep"]
    assert (s["still_does"], s["parent_estimate_min"], s["parent_estimate_max"]) == (True, 5, 9)
    assert s["named_by_parent"] is False


async def test_one_they_no_longer_do_is_marked_so(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    await api.put(f"/parent/accommodation-suggestions/{f['logged'].id}", json={"still_does": False})

    assert (await _suggestions(api, f))["Lies down with them until asleep"]["still_does"] is False


async def test_what_they_name_is_a_suggestion_not_a_plan_row(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    r = await api.post("/parent/accommodation-suggestions", json={
        "trigger_situation_id": str(f["situation"].id), "name": "Leaves the hall light on",
        "estimate_min": 3, "estimate_max": 3})
    assert r.status_code == 200, r.text

    s = (await _suggestions(api, f))["Leaves the hall light on"]
    assert s["named_by_parent"] is True
    assert (s["parent_estimate_min"], s["parent_estimate_max"]) == (3, 3)
    assert s["added"] is False
    rows = (await db.execute(select(AccommodationBehavior).where(
        AccommodationBehavior.treatment_plan_id == f["plan"].id))).scalars().all()
    assert rows == []


async def test_adding_it_to_the_plan_carries_the_parents_estimate(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    created = (await api.post("/parent/accommodation-suggestions", json={
        "trigger_situation_id": str(f["situation"].id), "name": "Checks on them every ten minutes",
        "estimate_min": 6, "estimate_max": 8})).json()

    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/insights/{created['id']}/add")
    assert r.status_code == 200, r.text
    [acc] = (await api.get(f"/plans/{f['plan'].id}/accommodations")).json()
    assert (acc["parent_estimate_min"], acc["parent_estimate_max"]) == (6, 8)
    assert acc["trigger_situation_id"] == str(f["situation"].id)
    assert acc["child_rated_at"] is None


async def test_an_estimate_on_one_already_on_the_plan_reaches_the_plan(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    await api.post(f"/patients/{f['child'].id}/insights/{f['logged'].id}/add")

    api.sign_in_as(f["parent"])
    await api.put(f"/parent/accommodation-suggestions/{f['logged'].id}",
                  json={"estimate_min": 4, "estimate_max": 7})

    api.sign_in_as(f["clinician"].user)
    [acc] = (await api.get(f"/plans/{f['plan'].id}/accommodations")).json()
    assert (acc["parent_estimate_min"], acc["parent_estimate_max"]) == (4, 7)


async def test_the_estimate_is_checked(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    url = f"/parent/accommodation-suggestions/{f['logged'].id}"
    for bad in ({"estimate_min": 8, "estimate_max": 3}, {"estimate_min": 0}, {"estimate_max": 11}):
        assert (await api.put(url, json=bad)).status_code == 422, bad


async def test_not_on_another_familys_situation_or_suggestion(api, db):
    f = await _family(db)
    other = await _family(db)
    api.sign_in_as(f["parent"])

    r = await api.post("/parent/accommodation-suggestions", json={
        "trigger_situation_id": str(other["situation"].id), "name": "Something"})
    assert r.status_code == 404, r.text
    r = await api.put(f"/parent/accommodation-suggestions/{other['logged'].id}", json={"still_does": False})
    assert r.status_code == 404, r.text
    await db.refresh(other["logged"])
    assert other["logged"].still_does is None


async def test_one_the_clinician_took_off_the_list_is_not_asked_about(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    await api.post(f"/patients/{f['child'].id}/insights/{f['logged'].id}/remove")

    api.sign_in_as(f["parent"])
    [sit] = (await api.get("/parent/accommodation-conversation")).json()["situations"]
    assert sit["items"] == []


async def test_the_parent_never_gets_the_childs_rating(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    await api.post(f"/patients/{f['child'].id}/insights/{f['logged'].id}/add")
    acc = (await db.execute(select(AccommodationBehavior).where(
        AccommodationBehavior.treatment_plan_id == f["plan"].id))).scalar_one()
    acc.distress_min, acc.distress_max = 7, 9
    await db.flush()

    api.sign_in_as(f["parent"])
    for url in ("/parent/accommodation-conversation", "/parent/accommodations"):
        r = await api.get(url)
        assert r.status_code == 200, (url, r.text)
        # The security review found /parent/accommodations sending the whole row.
        assert "distress" not in r.text and "child_rated_at" not in r.text, url


async def test_a_child_cannot_use_the_parents_questions(api, db):
    f = await _family(db)
    api.sign_in_as(f["child"].user)
    assert (await api.get("/parent/accommodation-conversation")).status_code == 403
    r = await api.post("/parent/accommodation-suggestions", json={
        "trigger_situation_id": str(f["situation"].id), "name": "Something"})
    assert r.status_code == 403


# ── In session: the clinician asks and types ─────────────────────────────────

async def test_the_clinician_goes_through_it_with_the_parent_in_session(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    base = f"/patients/{f['child'].id}/insights"

    [sit] = (await api.get(f"{base}/accommodation-conversation")).json()["situations"]
    assert [i["name"] for i in sit["items"]] == ["Lies down with them until asleep"]

    r = await api.put(f"{base}/{f['logged'].id}/parent-answer",
                      json={"still_does": True, "estimate_min": 6, "estimate_max": 8})
    assert r.status_code == 200, r.text
    r = await api.post(f"{base}/parent-named", json={
        "trigger_situation_id": str(f["situation"].id), "name": "Sits outside the door",
        "estimate_min": 4})
    assert r.status_code == 200, r.text

    s = await _suggestions(api, f)
    assert (s["Lies down with them until asleep"]["parent_estimate_min"], s["Lies down with them until asleep"]["named_by_parent"]) == (6, False)
    assert s["Sits outside the door"]["named_by_parent"] is True
    assert (s["Sits outside the door"]["parent_estimate_min"], s["Sits outside the door"]["parent_estimate_max"]) == (4, 4)
    # Still only suggestions.
    assert (await api.get(f"/plans/{f['plan'].id}/accommodations")).json() == []


async def test_a_clinician_without_access_cannot_go_through_it(api, db):
    f = await _family(db)
    colleague = await make_practitioner(db, f["org"])
    api.sign_in_as(colleague.user)
    base = f"/patients/{f['child'].id}/insights"

    assert (await api.get(f"{base}/accommodation-conversation")).status_code in (403, 404)
    assert (await api.put(f"{base}/{f['logged'].id}/parent-answer", json={"still_does": False})).status_code in (403, 404)
    r = await api.post(f"{base}/parent-named", json={
        "trigger_situation_id": str(f["situation"].id), "name": "Something"})
    assert r.status_code in (403, 404)
    await db.refresh(f["logged"])
    assert f["logged"].still_does is None


async def test_in_session_it_cannot_reach_another_patients_suggestion(api, db):
    f = await _family(db)
    other = await _family(db)
    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"/patients/{f['child'].id}/insights/{other['logged'].id}/parent-answer",
                      json={"still_does": False})
    assert r.status_code == 404, r.text

