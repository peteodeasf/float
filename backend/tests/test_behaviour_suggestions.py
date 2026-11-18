"""Adding a behaviour from the monitoring log to its situation.

Step 3 of the interview (docs/plans/ladder-combinations.md): the therapist talks with the child
about what they do in the situation and decides which behaviours go into Float. Float suggests
them from the log. Nothing is added until the therapist taps one.
"""
from sqlalchemy import select

from app.models.insight import KIND_BEHAVIOR, KIND_SITUATION
from app.models.treatment import AvoidanceBehavior
from app.services.insight_service import get_insights, normalise_name, rebuild_from_monitoring

from tests.factories import grant_patient_to, make_org, make_plan, make_practitioner


def _extraction(behaviour_type):
    behaviour = {"description": "Wears headphones so nobody talks to her"}
    if behaviour_type:
        behaviour["type"] = behaviour_type
    return {"situations": [{
        "name": "Eating lunch in the cafeteria", "fear_rating": 6, "behaviors": [behaviour],
    }]}


async def _setup(db, behaviour_type="safety"):
    import uuid
    org = await make_org(db)
    plan = await make_plan(db, org)
    patient = plan.patient
    await rebuild_from_monitoring(
        db, patient_id=patient.id, organization_id=org.id, extraction=_extraction(behaviour_type),
        entry_ids_by_situation={normalise_name("Eating lunch in the cafeteria"): [uuid.uuid4()]},
    )
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    items = await get_insights(db, patient_id=patient.id, organization_id=org.id)
    situation = next(i for i in items if i.kind == KIND_SITUATION)
    behaviour = next(i for i in items if i.kind == KIND_BEHAVIOR)
    return plan, patient, clinician, situation, behaviour


async def test_a_behaviour_is_added_under_its_situation(api, db):
    plan, patient, clinician, situation, behaviour = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/insights/{situation.id}/add")

    r = await api.post(f"/patients/{patient.id}/insights/{behaviour.id}/add")

    assert r.status_code == 200, r.text
    await db.refresh(situation)
    row = (await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.trigger_situation_id == situation.trigger_situation_id)
    )).scalar_one()
    assert (row.name, row.behavior_type) == ("Wears headphones so nobody talks to her", "safety")
    # A behaviour is not a rung. Its combination is, and the therapist makes that next.
    assert row.without_behavior_id is None


async def test_the_list_says_what_kind_of_behaviour_it_is(api, db):
    _, patient, clinician, situation, _ = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/insights/{situation.id}/add")

    items = (await api.get(f"/patients/{patient.id}/insights?kind=behavior")).json()

    assert items[0]["behavior_type"] == "safety"
    assert items[0]["situation_id"] is not None


async def test_its_situation_has_to_be_on_the_ladder_first(api, db):
    _, patient, clinician, _, behaviour = await _setup(db)
    api.sign_in_as(clinician.user)

    r = await api.post(f"/patients/{patient.id}/insights/{behaviour.id}/add")

    assert r.status_code == 400


async def test_every_suggestion_is_added_as_safety_whatever_the_ai_called_it(api, db):
    # Peter, 2026-11-18: everything added from a suggestion is a safety behavior. This replaced the
    # test that an "escape" suggestion is refused until the clinician says which kind it is.
    for ai_type in ("escape", "avoidance", "unclear"):
        _, patient, clinician, situation, behaviour = await _setup(db, behaviour_type=ai_type)
        api.sign_in_as(clinician.user)
        await api.post(f"/patients/{patient.id}/insights/{situation.id}/add")

        r = await api.post(f"/patients/{patient.id}/insights/{behaviour.id}/add")

        assert r.status_code == 200, (ai_type, r.text)
        await db.refresh(behaviour)
        row = await db.get(AvoidanceBehavior, behaviour.avoidance_behavior_id)
        assert row.behavior_type == "safety", ai_type


async def test_only_avoidance_or_safety_can_be_chosen(api, db):
    _, patient, clinician, situation, behaviour = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/insights/{situation.id}/add")

    r = await api.post(
        f"/patients/{patient.id}/insights/{behaviour.id}/add", json={"behavior_type": "combination"},
    )

    assert r.status_code == 400


async def test_removing_the_behaviour_puts_the_suggestion_back(api, db):
    _, patient, clinician, situation, behaviour = await _setup(db)
    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/insights/{situation.id}/add")
    await api.post(f"/patients/{patient.id}/insights/{behaviour.id}/add")
    await db.refresh(situation)
    await db.refresh(behaviour)

    await api.delete(f"/triggers/{situation.trigger_situation_id}/behaviors/{behaviour.avoidance_behavior_id}")
    # The database cleared the link (ON DELETE SET NULL). The test shares one session with the
    # app, which still holds the old value; a real request starts with a fresh session.
    await db.refresh(behaviour)
    items = (await api.get(f"/patients/{patient.id}/insights?kind=behavior")).json()

    assert [i["name"] for i in items] == ["Wears headphones so nobody talks to her"]
