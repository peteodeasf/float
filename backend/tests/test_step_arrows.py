"""The downward arrow on a ladder step.

Peter, 2026-10-15, after clinical review with Dr. Walker: the arrow is done for each combination
(a situation without one safety behaviour), not for the situation as a whole. Not on a
sub-situation for now. docs/plans/ladder-combinations.md, step 3.
"""
from sqlalchemy import select

from app.models.downward_arrow import DownwardArrow
from app.models.treatment import AvoidanceBehavior

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


async def test_an_arrow_opens_on_a_combination(api, db):
    _, patient, _, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["rung_id"] == str(combination.id)
    # Not on the situation, so it does not collide with the situation's own arrow.
    assert body["trigger_situation_id"] is None
    assert body["patient_id"] == str(patient.id)


async def test_opening_twice_gives_the_same_arrow(api, db):
    _, _, _, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)

    first = (await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})).json()
    second = (await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})).json()

    assert first["id"] == second["id"]


async def test_two_combinations_on_one_situation_each_get_their_own(api, db):
    org, _, plan, situation, clinician, _, combination = await _setup(db)
    other_safety = await make_rung(db, situation=situation, name="Pretends to be busy", behavior_type="safety")
    other = AvoidanceBehavior(
        trigger_situation_id=situation.id, treatment_plan_id=plan.id, organization_id=org.id,
        name="Answer without pretending to be busy", behavior_type="combination",
        without_behavior_id=other_safety.id,
    )
    db.add(other)
    await db.flush()
    api.sign_in_as(clinician.user)

    a = (await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})).json()
    b = (await api.post(f"/triggers/{situation.id}/behaviors/{other.id}/downward-arrow", json={})).json()
    listed = (await api.get(f"/triggers/{situation.id}/behaviors/downward-arrows")).json()

    assert a["id"] != b["id"]
    assert {x["rung_id"] for x in listed} == {str(combination.id), str(other.id)}


async def test_no_arrow_on_a_sub_situation_or_a_behaviour_for_now(api, db):
    """Peter, 2026-10-15: "My inclination is no, but that could change." """
    _, _, _, situation, clinician, safety, _ = await _setup(db)
    sub = await make_rung(db, situation=situation, name="Sit in the middle row", behavior_type="scenario")
    api.sign_in_as(clinician.user)

    on_sub = await api.post(f"/triggers/{situation.id}/behaviors/{sub.id}/downward-arrow", json={})
    on_safety = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/downward-arrow", json={})

    assert on_sub.status_code == 400
    assert on_safety.status_code == 400


async def test_another_situations_step_is_refused(api, db):
    _, _, plan, situation, clinician, _, combination = await _setup(db)
    elsewhere = await make_situation(db, plan, name="Lunch in the cafeteria")
    api.sign_in_as(clinician.user)

    r = await api.post(f"/triggers/{elsewhere.id}/behaviors/{combination.id}/downward-arrow", json={})

    assert r.status_code == 404


async def test_a_clinician_without_access_cannot_open_one(api, db):
    org, _, _, situation, _, _, combination = await _setup(db)
    stranger = await make_practitioner(db, org, name="No grant")
    api.sign_in_as(stranger.user)

    r = await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})

    assert r.status_code in (403, 404)


async def test_the_step_arrow_is_not_mistaken_for_the_patients_anchor_arrow(api, db):
    """The pre-ladder anchor is the one arrow with no situation and no typed situation. An arrow
    on a step also has no situation, and must not be returned as the anchor."""
    _, patient, _, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)
    step_arrow = (await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})).json()

    anchor = (await api.post(f"/patients/{patient.id}/downward-arrows", json={})).json()

    assert anchor["id"] != step_arrow["id"]


async def test_the_arrow_goes_with_its_step(api, db):
    _, _, plan, situation, clinician, _, combination = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/triggers/{situation.id}/behaviors/{combination.id}/downward-arrow", json={})

    r = await api.delete(f"/plans/{plan.id}/rungs/{combination.id}")

    assert r.status_code == 204
    left = (await db.execute(select(DownwardArrow).where(DownwardArrow.rung_id == combination.id))).all()
    assert left == []


async def test_the_child_sees_each_steps_own_feared_outcome(api, db):
    org, patient, plan, situation, _, _, combination = await _setup(db)
    plan.ladder_active = True
    sub = await make_rung(db, situation=situation, name="Sit in the middle row", behavior_type="scenario",
                          dt=4, parent=combination)
    db.add(DownwardArrow(
        rung_id=combination.id, patient_id=patient.id, organization_id=org.id,
        arrow_steps=[], feared_outcome="Everyone will laugh at my answer.",
        facilitated_by="practitioner",
    ))
    await db.flush()

    api.sign_in_as(patient.user)
    rungs = {r["name"]: r for r in (await api.get("/patient/ladder")).json()["rungs"]}

    assert rungs[combination.name]["feared_outcome"] == "Everyone will laugh at my answer."
    # A sub-situation under a combination takes the combination's.
    assert rungs[sub.name]["feared_outcome"] == "Everyone will laugh at my answer."


async def test_situation_suggestions_can_use_an_arrow_done_on_one_of_its_steps(api, db, monkeypatch):
    """The situation no longer gets its own arrow, so its suggestions use the feared outcome from
    an arrow done on one of its steps."""
    async def fake(**kwargs):
        assert kwargs["feared_outcome"] == "Everyone will laugh at my answer."
        return ["A smaller version"], ""

    monkeypatch.setattr("app.api.routers.trigger_situations.suggest_steps", fake)
    org, patient, plan, situation, clinician, _, combination = await _setup(db)
    db.add(DownwardArrow(
        rung_id=combination.id, patient_id=patient.id, organization_id=org.id,
        arrow_steps=[], feared_outcome="Everyone will laugh at my answer.",
        facilitated_by="practitioner",
    ))
    await db.flush()
    api.sign_in_as(clinician.user)

    body = (await api.post(f"/plans/{plan.id}/triggers/{situation.id}/suggested-steps")).json()

    assert body["suggestions"] == ["A smaller version"]


async def test_the_childs_progress_screens_get_a_fear_from_a_step_arrow(api, db):
    """The progress screens read the fear per situation. With the arrow now done on each step,
    a situation with no arrow of its own takes its steps'."""
    org, patient, plan, situation, _, _, combination = await _setup(db)
    db.add(DownwardArrow(
        rung_id=combination.id, patient_id=patient.id, organization_id=org.id,
        arrow_steps=[], feared_outcome="Everyone will laugh at my answer.",
        facilitated_by="practitioner",
    ))
    await db.flush()

    api.sign_in_as(patient.user)
    groups = (await api.get("/patient/ladder")).json()["situations"]

    assert [g["feared_outcome"] for g in groups if g["id"] == str(situation.id)] == ["Everyone will laugh at my answer."]


async def test_a_parent_arrow_on_a_step_does_not_feed_the_suggestions(api, db, monkeypatch):
    """A parent's run is their guess at the child's fear, not something the child said."""
    seen = []

    async def fake(**kwargs):
        seen.append(kwargs["feared_outcome"])
        return ["A smaller version"], ""

    monkeypatch.setattr("app.api.routers.trigger_situations.suggest_steps", fake)
    org, patient, plan, situation, clinician, _, combination = await _setup(db)
    db.add(DownwardArrow(
        rung_id=combination.id, patient_id=patient.id, organization_id=org.id,
        arrow_steps=[], feared_outcome="A parent's guess.", facilitated_by="parent",
    ))
    await db.flush()
    api.sign_in_as(clinician.user)

    body = (await api.post(f"/plans/{plan.id}/triggers/{situation.id}/suggested-steps")).json()

    # Asked without a feared outcome, not with the parent's.
    assert seen == [""]
    assert body["suggestions"] == ["A smaller version"]
