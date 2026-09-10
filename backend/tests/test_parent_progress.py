"""The parent sees the child's progress — only once the clinician switches it on.

Plan: docs/plans/parent-sees-child-progress.md
"""
from datetime import datetime, timedelta, timezone

from app.models.experiment import Experiment

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)
from tests.test_role_boundary import _parent_of

# Every one of the child's own words carries this. It must never reach the parent.
PRIVATE = "ZZCHILDSWORDSZZ"


async def _family(db, ladder_on=True):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Child")
    plan = await make_plan(db, org, patient=child)
    plan.ladder_active = ladder_on
    situation = await make_situation(db, plan, name="Eye contact in the hall")
    easy = await make_rung(db, situation=situation, behavior_type="scenario", dt=3, name="Look up at John")
    hard = await make_rung(db, situation=situation, behavior_type="scenario", dt=7, name="Say hi to John")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)

    now = datetime.now(timezone.utc)
    words = dict(prediction=f"{PRIVATE} prediction", what_happened=f"{PRIVATE} happened",
                 what_learned=f"{PRIVATE} learned", plan_description=f"{PRIVATE} plan")
    db.add_all([
        Experiment(patient_id=child.id, organization_id=org.id, avoidance_behavior_id=hard.id,
                   status="committed", scheduled_date=now + timedelta(days=2),
                   scheduled_time_bucket="morning", bip_before=70, **words),
        Experiment(patient_id=child.id, organization_id=org.id, avoidance_behavior_id=easy.id,
                   status="completed", completed_date=now - timedelta(days=1), bip_before=60,
                   distress_thermometer_actual=4, **words),
        Experiment(patient_id=child.id, organization_id=org.id, avoidance_behavior_id=easy.id,
                   status="too_hard", **words),
        # An older exposure on no step: nothing safe to name it by, so it is left out.
        Experiment(patient_id=child.id, organization_id=org.id, status="committed",
                   scheduled_date=now + timedelta(days=1), **words),
    ])
    await db.flush()
    return child, clinician, parent


async def _share(api, clinician, child, on=True):
    api.sign_in_as(clinician.user)
    return await api.put(f"/patients/{child.id}/parent-progress-sharing", json={"shared": on})


async def test_off_by_default_the_parent_sees_nothing_of_the_exposures(api, db):
    _, _, parent = await _family(db)
    api.sign_in_as(parent)

    assert (await api.get("/parent/child/progress")).json() == {"shared": False}
    # The list the parent home already showed waits for the same switch.
    assert (await api.get("/parent/child/experiments/upcoming")).json() == []


async def test_switched_on_the_parent_sees_the_ladder_planned_and_done(api, db):
    child, clinician, parent = await _family(db)
    r = await _share(api, clinician, child)
    assert r.status_code == 200, r.text
    assert r.json()["progress_shared_with_parent_at"] is not None

    api.sign_in_as(parent)
    r = await api.get("/parent/child/progress")
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["shared"] is True
    assert [s["name"] for s in body["steps"]] == ["Look up at John", "Say hi to John"]
    assert body["steps"][0]["times_done"] == 1
    assert body["steps"][0]["status"] == "in_progress"
    assert body["steps"][0]["fear_level"] == 3
    assert [p["step_name"] for p in body["planned"]] == ["Say hi to John"]
    assert sorted(d["outcome"] for d in body["done"]) == ["did_it", "too_hard"]

    upcoming = await api.get("/parent/child/experiments/upcoming")
    assert [u["behavior_name"] for u in upcoming.json()] == ["Say hi to John"]


async def test_the_childs_own_words_and_ratings_never_reach_the_parent(api, db):
    child, clinician, parent = await _family(db)
    await _share(api, clinician, child)

    api.sign_in_as(parent)
    for url in ("/parent/child/progress", "/parent/child/experiments/upcoming"):
        r = await api.get(url)
        assert PRIVATE not in r.text, url
        for field in ("prediction", "what_happened", "what_learned", "bip_before",
                      "distress_thermometer_actual", "dt_actual", "plan_description"):
            assert f'"{field}"' not in r.text, (url, field)


async def test_switching_it_off_stops_it_straight_away(api, db):
    child, clinician, parent = await _family(db)
    await _share(api, clinician, child)
    await _share(api, clinician, child, on=False)

    api.sign_in_as(parent)
    assert (await api.get("/parent/child/progress")).json() == {"shared": False}
    assert (await api.get("/parent/child/experiments/upcoming")).json() == []


async def test_a_clinician_without_access_cannot_switch_it(api, db):
    child, _, parent = await _family(db)
    outsider = await make_practitioner(db, (await make_org(db)))
    colleague = await make_practitioner(db, await _org_of(db, child))

    for who in (outsider, colleague):
        r = await _share(api, who, child)
        assert r.status_code in (403, 404), r.text

    api.sign_in_as(parent)
    assert (await api.get("/parent/child/progress")).json() == {"shared": False}


async def test_another_familys_parent_sees_none_of_it(api, db):
    child, clinician, _ = await _family(db)
    await _share(api, clinician, child)
    other_child, other_clinician, other_parent = await _family(db)

    api.sign_in_as(other_parent)
    r = await api.get("/parent/child/progress")
    assert r.json() == {"shared": False}
    assert "Sam Child" not in r.text


async def test_a_ladder_not_switched_on_for_the_child_is_not_shown(api, db):
    child, clinician, parent = await _family(db, ladder_on=False)
    await _share(api, clinician, child)

    api.sign_in_as(parent)
    assert (await api.get("/parent/child/progress")).json() == {
        "shared": True, "steps": [], "planned": [], "done": []}


async def test_the_child_is_told_their_parent_can_see_it(api, db):
    child, clinician, _ = await _family(db)

    api.sign_in_as(child.user)
    assert (await api.get("/patient/ladder")).json()["plan"]["shared_with_parent"] is False

    await _share(api, clinician, child)
    api.sign_in_as(child.user)
    assert (await api.get("/patient/ladder")).json()["plan"]["shared_with_parent"] is True


async def _org_of(db, child):
    from app.models.organization import Organization
    return await db.get(Organization, child.organization_id)
