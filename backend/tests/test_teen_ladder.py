"""What the child's app sees on their ladder.

The clinician's ladder became flat on 2026-08-26 — steps are the primary thing and a situation is
just grouping, so a step can exist with no situation at all. This endpoint found steps BY
situation, so those steps were invisible to the child: the clinician added a step, saw it on their
ladder, and the child never got it. One existed in production.
"""
import uuid

from app.models.treatment import AvoidanceBehavior
from tests.factories import grant_patient_to, make_org, make_plan, make_practitioner, make_situation


async def _ladder(api, patient):
    api.sign_in_as(patient.user)
    r = await api.get("/patient/ladder")
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_step_with_no_situation_reaches_the_child(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    db.add(AvoidanceBehavior(
        treatment_plan_id=plan.id, organization_id=org.id, behavior_type="scenario",
        name="View 3 of Diana's posts on my own",
        distress_thermometer_when_refraining=4,
    ))
    await db.flush()

    data = await _ladder(api, plan.patient)

    names = [b["name"] for s in data["situations"] for b in s["behaviors"]]
    assert "View 3 of Diana's posts on my own" in names


async def test_it_arrives_in_its_own_group_and_is_visible(api, db):
    """The child's screen picks a group then shows its steps, so an ungrouped step needs a group.
    And it must be switched on, or it is invisible again for a different reason."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    db.add(AvoidanceBehavior(
        treatment_plan_id=plan.id, organization_id=org.id, behavior_type="scenario", name="On its own",
    ))
    await db.flush()

    data = await _ladder(api, plan.patient)
    group = next(s for s in data["situations"] if s["id"] == "ungrouped")

    assert group["is_active"] is True
    assert [b["name"] for b in group["behaviors"]] == ["On its own"]


async def test_no_empty_group_when_every_step_has_a_situation(api, db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="Eating in the cafeteria")
    db.add(AvoidanceBehavior(
        treatment_plan_id=plan.id, trigger_situation_id=situation.id,
        organization_id=org.id, behavior_type="scenario", name="Eat there for ten minutes",
    ))
    await db.flush()

    data = await _ladder(api, plan.patient)

    assert [s["id"] for s in data["situations"]] != []
    assert not any(s["id"] == "ungrouped" for s in data["situations"])


async def test_grouped_steps_still_arrive_under_their_situation(api, db):
    """The refactor moved the per-step building into a helper. This is the half that already
    worked, and must keep working."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="Raising my hand")
    db.add(AvoidanceBehavior(
        treatment_plan_id=plan.id, trigger_situation_id=situation.id,
        organization_id=org.id, behavior_type="scenario", name="Raise it once",
        distress_thermometer_when_refraining=5,
    ))
    await db.flush()

    data = await _ladder(api, plan.patient)
    group = next(s for s in data["situations"] if s["name"] == "Raising my hand")

    assert [b["name"] for b in group["behaviors"]] == ["Raise it once"]
    assert group["behaviors"][0]["dt"] == 5
    assert group["behaviors"][0]["status"] == "not_started"


async def test_a_child_never_sees_another_child_s_steps(api, db):
    org = await make_org(db)
    mine = await make_plan(db, org)
    theirs = await make_plan(db, org)
    db.add(AvoidanceBehavior(
        treatment_plan_id=theirs.id, organization_id=org.id, behavior_type="scenario", name="Not yours",
    ))
    await db.flush()

    data = await _ladder(api, mine.patient)

    names = [b["name"] for s in data["situations"] for b in s["behaviors"]]
    assert "Not yours" not in names
