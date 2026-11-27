"""Action plans: building one, carrying items over, publishing, and who sees what.

docs/plans/action-plans-build.md
"""
from app.models.action_plan import Tool
from app.models.experiment import AccommodationBehavior

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)
from tests.test_role_boundary import _parent_of


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org)
    plan = await make_plan(db, org, patient=child)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)
    situation = await make_situation(db, plan, name="Lunch")
    rung = await make_rung(db, situation=situation, name="Eat lunch in the cafeteria", dt=5,
                           behavior_type="scenario")
    acc = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                name="Checks homework every night", status="started")
    tool = Tool(name="The worry hill", description="A short video")
    db.add_all([acc, tool])
    await db.flush()
    return {"org": org, "child": child, "clinician": clinician, "parent": parent,
            "rung": rung, "acc": acc, "tool": tool}


async def _full_plan(api, f):
    api.sign_in_as(f["clinician"].user)
    pid = f["child"].id
    plan = (await api.post(f"/patients/{pid}/action-plans", json={})).json()
    url = f"/action-plans/{plan['id']}/items"
    await api.post(url, json={"kind": "exposure", "avoidance_behavior_id": str(f["rung"].id),
                              "text": "Eat lunch in the cafeteria on Tuesday", "note": "With Sam"})
    await api.post(url, json={"kind": "tool", "tool_id": str(f["tool"].id), "note": "Watch it twice"})
    await api.post(url, json={"kind": "accommodation", "accommodation_behavior_id": str(f["acc"].id)})
    await api.post(url, json={"kind": "parent_instruction", "text": "Acknowledge once",
                              "note": "Parent only note"})
    await api.post(url, json={"kind": "parent_instruction", "text": "Praise trying", "share_with_child": True})
    r = await api.post(url, json={"kind": "reward", "text": "Pick the movie", "reward_for": "Lunch"})
    assert r.status_code == 201, r.text
    return r.json()


async def test_a_plan_is_built_and_the_rung_keeps_its_own_wording(api, db):
    f = await _family(db)
    plan = await _full_plan(api, f)
    kinds = [i["kind"] for i in plan["items"]]
    assert kinds == ["exposure", "tool", "accommodation", "parent_instruction", "parent_instruction", "reward"]
    exposure = plan["items"][0]
    assert exposure["label"] == "Eat lunch in the cafeteria on Tuesday"
    assert exposure["rung_name"] == "Eat lunch in the cafeteria"
    await db.refresh(f["rung"])
    assert f["rung"].name == "Eat lunch in the cafeteria"


async def test_publishing_needs_high_confidence(api, db):
    f = await _family(db)
    plan = await _full_plan(api, f)
    url = f"/action-plans/{plan['id']}"
    assert (await api.post(f"{url}/publish")).status_code == 422
    await api.patch(url, json={"confidence": "medium"})
    assert (await api.post(f"{url}/publish")).status_code == 422
    await api.patch(url, json={"confidence": "high"})
    r = await api.post(f"{url}/publish")
    assert r.status_code == 200 and r.json()["published_at"]


async def test_tools_only_from_the_list(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    plan = (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).json()
    r = await api.post(f"/action-plans/{plan['id']}/items", json={"kind": "tool", "text": "My own tool"})
    assert r.status_code == 422


async def test_another_childs_rung_cannot_go_on_the_plan(api, db):
    f = await _family(db)
    other = await make_patient(db, f["org"])
    other_plan = await make_plan(db, f["org"], patient=other)
    their_rung = await make_rung(db, situation=await make_situation(db, other_plan), behavior_type="scenario")
    api.sign_in_as(f["clinician"].user)
    plan = (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).json()
    r = await api.post(f"/action-plans/{plan['id']}/items",
                       json={"kind": "exposure", "avoidance_behavior_id": str(their_rung.id)})
    assert r.status_code == 404


async def _publish(api, plan):
    await api.patch(f"/action-plans/{plan['id']}", json={"confidence": "high"})
    return (await api.post(f"/action-plans/{plan['id']}/publish")).json()


async def test_the_child_sees_their_items_and_shared_instructions_only(api, db):
    f = await _family(db)
    await _publish(api, await _full_plan(api, f))
    api.sign_in_as(f["child"].user)
    mine = (await api.get("/patient/action-plan")).json()
    assert [(i["kind"], i["label"]) for i in mine["items"]] == [
        ("exposure", "Eat lunch in the cafeteria on Tuesday"),
        ("tool", "The worry hill"),
        ("parent_instruction", "Praise trying"),
        ("reward", "Pick the movie"),
    ]
    assert all("reward_given" not in i for i in mine["items"])
    assert "Parent only note" not in str(mine)


async def test_a_draft_is_not_seen_by_the_family(api, db):
    f = await _family(db)
    await _full_plan(api, f)
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json() is None
    api.sign_in_as(f["parent"])
    assert (await api.get("/parent/action-plan")).json() is None


async def test_the_parent_answers_was_the_reward_given(api, db):
    f = await _family(db)
    plan = await _publish(api, await _full_plan(api, f))
    reward = next(i for i in plan["items"] if i["kind"] == "reward")
    exposure = next(i for i in plan["items"] if i["kind"] == "exposure")

    api.sign_in_as(f["parent"])
    seen = (await api.get("/parent/action-plan")).json()
    assert len(seen["items"]) == 6
    r = await api.put(f"/parent/action-plan-items/{reward['id']}/reward-given", json={"given": True})
    assert r.status_code == 200
    got = next(i for i in r.json()["items"] if i["kind"] == "reward")
    assert (got["reward_given"], got["reward_given_by"]) == (True, "parent")
    # Only a reward.
    r = await api.put(f"/parent/action-plan-items/{exposure['id']}/reward-given", json={"given": True})
    assert r.status_code == 422


async def test_another_parent_cannot_mark_the_reward(api, db):
    f = await _family(db)
    plan = await _publish(api, await _full_plan(api, f))
    reward = next(i for i in plan["items"] if i["kind"] == "reward")
    g = await _family(db)
    api.sign_in_as(g["parent"])
    r = await api.put(f"/parent/action-plan-items/{reward['id']}/reward-given", json={"given": True})
    assert r.status_code == 404


async def test_the_next_plan_carries_over_kept_items(api, db):
    f = await _family(db)
    plan = await _publish(api, await _full_plan(api, f))
    exposure = next(i for i in plan["items"] if i["kind"] == "exposure")
    reward = next(i for i in plan["items"] if i["kind"] == "reward")
    # The parent did not answer, so the clinician marks it at the next session.
    r = await api.put(f"/action-plan-items/{reward['id']}/reward-given", json={"given": False})
    assert r.status_code == 200

    r = await api.post(f"/patients/{f['child'].id}/action-plans", json={"keep_item_ids": [exposure["id"]]})
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["session_number"] == 2
    assert [(i["kind"], i["label"], i["note"]) for i in new["items"]] == [
        ("exposure", "Eat lunch in the cafeteria on Tuesday", "With Sam")]

    plans = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()
    old = plans[1]
    outcomes = {i["kind"]: i["outcome"] for i in old["items"]}
    assert outcomes["exposure"] == "keep" and outcomes["tool"] == "done"
    old_reward = next(i for i in old["items"] if i["kind"] == "reward")
    assert (old_reward["reward_given"], old_reward["reward_given_by"]) == (False, "clinician")


async def test_only_one_draft_at_a_time(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    assert (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).status_code == 201
    assert (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).status_code == 409


async def test_a_safety_behaviour_is_not_an_exposure(api, db):
    """Only a step on the ladder goes on the plan as an exposure."""
    f = await _family(db)
    safety = await make_rung(db, plan=None, situation=await make_situation(db, await _tp(db, f)),
                             behavior_type="safety")
    api.sign_in_as(f["clinician"].user)
    plan = (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).json()
    r = await api.post(f"/action-plans/{plan['id']}/items",
                       json={"kind": "exposure", "avoidance_behavior_id": str(safety.id)})
    assert r.status_code == 404


async def _tp(db, f):
    from sqlalchemy import select
    from app.models.treatment import TreatmentPlan
    return (await db.execute(select(TreatmentPlan).where(TreatmentPlan.patient_id == f["child"].id))).scalar_one()


async def test_a_tool_link_must_be_a_web_address(api, db):
    from tests.factories import make_float_admin
    admin = await make_float_admin(db)
    api.sign_in_as(admin)
    r = await api.post("/admin/tools", json={"name": "Bad", "link": "javascript:alert(1)"})
    assert r.status_code == 400
    r = await api.post("/admin/tools", json={"name": "Good", "link": "https://example.com/hill"})
    assert r.status_code == 200, r.text


async def test_an_older_plan_cannot_be_changed_and_a_shared_one_cannot_be_deleted(api, db):
    f = await _family(db)
    first = await _publish(api, await _full_plan(api, f))
    assert (await api.delete(f"/action-plans/{first['id']}")).status_code == 409
    await api.post(f"/patients/{f['child'].id}/action-plans", json={})
    item = first["items"][0]
    assert (await api.patch(f"/action-plan-items/{item['id']}", json={"note": "x"})).status_code == 409
    assert (await api.delete(f"/action-plan-items/{item['id']}")).status_code == 409
    assert (await api.post(f"/action-plans/{first['id']}/items",
                           json={"kind": "reward", "text": "x"})).status_code == 409
    # Marking last week's reward is still allowed: that is what the next session does.
    reward = next(i for i in first["items"] if i["kind"] == "reward")
    assert (await api.put(f"/action-plan-items/{reward['id']}/reward-given", json={"given": True})).status_code == 200


async def test_a_removed_tool_leaves_no_blank_line_for_the_family(api, db):
    f = await _family(db)
    await _publish(api, await _full_plan(api, f))
    await db.delete(f["tool"])
    await db.flush()
    api.sign_in_as(f["parent"])
    labels = [i["label"] for i in (await api.get("/parent/action-plan")).json()["items"]]
    assert "" not in labels and "The worry hill" not in labels
    api.sign_in_as(f["clinician"].user)
    plans = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()
    assert "(removed)" in [i["label"] for i in plans[0]["items"]]
