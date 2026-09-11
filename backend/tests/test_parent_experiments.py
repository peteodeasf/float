"""The parent's accommodation experiments: set up, recorded, seen by the right people only.

Peter, 2026-09-11: any accommodation, not only the focus; set up by the parent or the clinician;
"Not this time" rather than "I gave in". Plan: docs/plans/parent-accommodation-experiments.md
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.experiment import AccommodationBehavior, ParentExperiment

from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner
from tests.test_role_boundary import _parent_of

WHEN = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=19, minute=0, second=0, microsecond=0)


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    plan = await make_plan(db, org, patient=child)
    plan.status = "active"
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)
    focus = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                  name="Lies down with them until asleep", is_weekly_focus=True)
    other = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                  name="Answers for them at the doctor's")
    db.add_all([focus, other])
    await db.flush()
    return dict(org=org, child=child, plan=plan, clinician=clinician, parent=parent, focus=focus, other=other)


def _before(acc, **over):
    return {"accommodation_id": str(acc.id), "scheduled_date": WHEN.isoformat(),
            "scheduled_time_bucket": "evening", "instead": "Say goodnight and leave",
            "prediction": "She'll cry for an hour", "belief_before": 80, "expected_fear": 8,
            "readiness": "medium", **over}


async def test_the_parent_sets_one_up_on_any_accommodation(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    r = await api.post("/parent/experiments", json=_before(f["other"]))  # not the focus
    assert r.status_code == 201, r.text
    e = r.json()
    assert (e["accommodation_name"], e["status"], e["set_up_in_session"]) == (
        "Answers for them at the doctor's", "planned", False)

    mine = (await api.get("/parent/experiments")).json()
    assert [x["id"] for x in mine] == [e["id"]]


async def test_the_answers_are_checked(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    for bad in ({"belief_before": 150}, {"expected_fear": 0}, {"prediction": ""},
                {"scheduled_time_bucket": "noon"}, {"readiness": "maybe"}):
        r = await api.post("/parent/experiments", json=_before(f["focus"], **bad))
        assert r.status_code == 422, (bad, r.text)


async def test_how_it_went(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    e = (await api.post("/parent/experiments", json=_before(f["focus"]))).json()

    r = await api.put(f"/parent/experiments/{e['id']}/after", json={
        "did_it": "yes", "what_happened": "She cried for ten minutes, then slept", "actual_fear": 5,
        "prediction_happened": "no", "belief_after": 30, "what_learned": "She settles faster than I think"})
    assert r.status_code == 200, r.text
    done = r.json()
    assert (done["status"], done["actual_fear"], done["belief_after"], done["prediction_happened"]) == (
        "recorded", 5, 30, "no")

    again = await api.put(f"/parent/experiments/{e['id']}/after", json={"did_it": "partly"})
    assert again.status_code == 409


async def test_not_this_time_skips_the_rest(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    e = (await api.post("/parent/experiments", json=_before(f["focus"]))).json()

    r = await api.put(f"/parent/experiments/{e['id']}/after", json={
        "did_it": "not_this_time", "too_hard_reason": "She was already upset from school",
        "actual_fear": 9, "what_learned": "ignored"})
    done = r.json()
    assert (done["did_it"], done["too_hard_reason"], done["actual_fear"], done["what_learned"]) == (
        "not_this_time", "She was already upset from school", None, None)


async def test_gave_in_is_not_an_answer(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    e = (await api.post("/parent/experiments", json=_before(f["focus"]))).json()
    assert (await api.put(f"/parent/experiments/{e['id']}/after", json={"did_it": "gave_in"})).status_code == 422


async def test_both_parents_share_them(api, db):
    f = await _family(db)
    second = await _parent_of(db, f["org"], f["child"])
    api.sign_in_as(f["parent"])
    e = (await api.post("/parent/experiments", json=_before(f["focus"]))).json()

    api.sign_in_as(second)
    assert [x["id"] for x in (await api.get("/parent/experiments")).json()] == [e["id"]]
    assert (await api.put(f"/parent/experiments/{e['id']}/after", json={"did_it": "partly"})).status_code == 200


async def test_the_clinician_sees_them_and_can_set_one_up_in_session(api, db):
    f = await _family(db)
    api.sign_in_as(f["parent"])
    await api.post("/parent/experiments", json=_before(f["focus"]))

    api.sign_in_as(f["clinician"].user)
    base = f"/plans/{f['plan'].id}/accommodations/experiments"
    r = await api.post(base, json=_before(f["other"], prediction="He'll refuse to go in"))
    assert r.status_code == 201, r.text
    assert r.json()["set_up_in_session"] is True
    listed = (await api.get(base)).json()
    assert len(listed) == 2

    api.sign_in_as(f["parent"])
    assert len((await api.get("/parent/experiments")).json()) == 2


async def test_only_the_familys_own(api, db):
    f = await _family(db)
    other = await _family(db)
    api.sign_in_as(other["parent"])
    theirs = (await api.post("/parent/experiments", json=_before(other["focus"]))).json()

    api.sign_in_as(f["parent"])
    assert (await api.post("/parent/experiments", json=_before(other["focus"]))).status_code == 404
    assert (await api.put(f"/parent/experiments/{theirs['id']}/after", json={"did_it": "yes"})).status_code == 404
    assert (await api.get("/parent/experiments")).json() == []
    row = await db.get(ParentExperiment, __import__("uuid").UUID(theirs["id"]))
    await db.refresh(row)
    assert row.status == "planned"


async def test_a_clinician_without_access_cannot_see_or_set_up(api, db):
    f = await _family(db)
    colleague = await make_practitioner(db, f["org"])
    api.sign_in_as(colleague.user)
    base = f"/plans/{f['plan'].id}/accommodations/experiments"
    assert (await api.get(base)).status_code in (403, 404)
    assert (await api.post(base, json=_before(f["focus"]))).status_code in (403, 404)


async def test_the_child_cannot_use_the_parents_routes(api, db):
    f = await _family(db)
    api.sign_in_as(f["child"].user)
    assert (await api.get("/parent/experiments")).status_code == 403
    assert (await api.post("/parent/experiments", json=_before(f["focus"]))).status_code == 403


async def test_not_once_treatment_is_closed(api, db):
    f = await _family(db)
    f["child"].closed_at = datetime.now(timezone.utc)
    await db.flush()
    api.sign_in_as(f["parent"])
    assert (await api.post("/parent/experiments", json=_before(f["focus"]))).status_code == 403


async def test_the_parent_sees_their_own_estimate_to_start_from(api, db):
    f = await _family(db)
    f["focus"].parent_estimate_min, f["focus"].parent_estimate_max = 6, 8
    f["focus"].distress_min, f["focus"].distress_max = 3, 3
    await db.flush()
    api.sign_in_as(f["parent"])
    r = await api.get("/parent/accommodations")
    [focus] = [a for a in r.json() if a["id"] == str(f["focus"].id)]
    assert (focus["parent_estimate_min"], focus["parent_estimate_max"]) == (6, 8)
    assert "distress" not in r.text
