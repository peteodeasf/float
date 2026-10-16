"""Easier versions of a combination.

Peter, 2026-10-15: a sub-situation belongs to a combination or to the situation itself, and Float
suggests them. For a combination, the suggestions work from that combination's own downward arrow.
docs/plans/ladder-combinations.md, step 4 (step 6 of the interview).
"""
from app.models.downward_arrow import DownwardArrow
from app.models.treatment import AvoidanceBehavior
from app.services.avoidance_behavior_service import get_rungs_for_plan

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)


async def _setup(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    situation = await make_situation(db, plan, name="Participating in class verbally", dt=6)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    combination = AvoidanceBehavior(
        trigger_situation_id=situation.id, treatment_plan_id=plan.id, organization_id=org.id,
        name="Participate in class without sitting at the back", behavior_type="combination",
        distress_thermometer_when_refraining=5, without_behavior_id=safety.id,
    )
    db.add(combination)
    await db.flush()
    return org, patient, plan, situation, clinician, safety, combination


def _easier(parent, name="Participate in class sitting in the middle row", dt=4):
    return {"name": name, "behavior_type": "scenario", "parent_behavior_id": str(parent.id),
            "distress_thermometer_when_refraining": dt}


async def test_an_easier_version_goes_under_a_combination_and_on_the_ladder(api, db):
    org, _, plan, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/triggers/{situation.id}/behaviors", json=_easier(combination))

    assert r.status_code == 201, r.text
    assert r.json()["parent_behavior_id"] == str(combination.id)
    names = [x.name for x in await get_rungs_for_plan(db, plan.id, org.id)]
    assert names == ["Participate in class sitting in the middle row", combination.name]


async def test_only_under_a_combination(api, db):
    _, _, _, situation, clinician, safety, _ = await _setup(db)
    sub = await make_rung(db, situation=situation, name="Sit near the door", behavior_type="scenario")
    api.sign_in_as(clinician.user)

    under_safety = await api.post(f"/triggers/{situation.id}/behaviors", json=_easier(safety))
    under_sub = await api.post(f"/triggers/{situation.id}/behaviors", json=_easier(sub))

    assert under_safety.status_code == 400
    assert under_sub.status_code == 400


async def test_only_an_easier_version_goes_under_a_step(api, db):
    _, _, _, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/triggers/{situation.id}/behaviors", json={
        "name": "Hides", "behavior_type": "safety", "parent_behavior_id": str(combination.id),
    })

    assert r.status_code == 400


async def test_not_under_another_patients_step(api, db):
    """The parent comes from the body. Same gap as the situation id fixed in step 1."""
    org, _, _, _, clinician, _, their_combination = await _setup(db)
    my_child = await make_patient(db, org, name="My child")
    await grant_patient_to(db, my_child, clinician, owner=True)
    mine = await make_situation(db, await make_plan(db, org, patient=my_child), name="Mine")
    api.sign_in_as(clinician.user)

    r = await api.post(f"/triggers/{mine.id}/behaviors", json=_easier(their_combination))

    assert r.status_code == 404


async def test_an_easier_version_stays_with_its_step(api, db):
    _, _, plan, situation, clinician, _, combination = await _setup(db)
    other = await make_situation(db, plan, name="Lunch in the cafeteria")
    api.sign_in_as(clinician.user)
    sub = (await api.post(f"/triggers/{situation.id}/behaviors", json=_easier(combination))).json()

    r = await api.put(f"/plans/{plan.id}/rungs/{sub['id']}", json={"trigger_situation_id": str(other.id)})

    assert r.status_code == 400


async def test_removing_the_combination_removes_its_easier_versions(api, db):
    org, _, plan, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/triggers/{situation.id}/behaviors", json=_easier(combination))

    await api.delete(f"/plans/{plan.id}/rungs/{combination.id}")

    assert await get_rungs_for_plan(db, plan.id, org.id) == []


async def test_suggestions_for_a_combination_use_its_own_arrow(api, db, monkeypatch):
    seen = {}

    async def fake(**kwargs):
        seen.update(kwargs)
        return ["Answer one question from your usual seat"], ""

    monkeypatch.setattr("app.api.routers.trigger_situations.suggest_steps", fake)
    org, patient, plan, situation, clinician, _, combination = await _setup(db)
    await make_rung(db, situation=situation, name="Sit in the middle row", behavior_type="scenario",
                    parent=combination)
    db.add(DownwardArrow(
        rung_id=combination.id, patient_id=patient.id, organization_id=org.id, arrow_steps=[],
        feared_outcome="Everyone will laugh at my answer.", facilitated_by="practitioner",
    ))
    await db.flush()
    api.sign_in_as(clinician.user)

    body = (await api.post(f"/plans/{plan.id}/triggers/{situation.id}/steps/{combination.id}/suggested-steps")).json()

    assert body["suggestions"] == ["Answer one question from your usual seat"]
    assert seen["situation"] == combination.name
    assert seen["feared_outcome"] == "Everyone will laugh at my answer."
    assert seen["steps"] == ["Sit in the middle row"]
    assert "Sits at the back" in seen["coping"]


async def test_suggestions_for_a_combination_wait_for_its_arrow(api, db):
    _, _, plan, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)

    body = (await api.post(f"/plans/{plan.id}/triggers/{situation.id}/steps/{combination.id}/suggested-steps")).json()

    assert body["suggestions"] == []
    assert "downward arrow on this step" in body["blocked"]


async def test_suggestions_refuse_another_situations_step(api, db):
    _, _, plan, situation, clinician, _, combination = await _setup(db)
    other = await make_situation(db, plan, name="Lunch in the cafeteria")
    api.sign_in_as(clinician.user)

    r = await api.post(f"/plans/{plan.id}/triggers/{other.id}/steps/{combination.id}/suggested-steps")

    assert r.status_code == 404
