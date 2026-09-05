"""The suggested-steps endpoint runs.

It shipped on 2026-09-05 having never been called once: `assert_belongs_to` takes keyword arguments
and returns None, and the handler passed `plan_id` positionally and then used the return value. It
failed on every request and neither the import check nor the route sweep noticed — the sweep only
proves a route does not LEAK, not that it works.

These tests exercise the handler without reaching the model. The no-arrow path is the one that
returns before any model call, which is exactly what makes it a usable test of the plumbing.
"""
from app.models.downward_arrow import DownwardArrow
from app.models.treatment import AvoidanceBehavior

from tests.factories import (
    grant_patient_to, make_org, make_plan, make_practitioner, make_situation,
)


async def _clinician_on(db, org, plan):
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician, owner=True)
    return clinician


async def test_a_situation_with_no_arrow_is_told_to_do_the_arrow(api, db):
    """Dr. Walker, twice: the feared outcome decides the sub-situations. So no arrow, no
    suggestions — and the reason is shown rather than an error."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="Talking to people")
    clinician = await _clinician_on(db, org, plan)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/plans/{plan.id}/triggers/{situation.id}/suggested-steps")

    assert r.status_code == 200
    body = r.json()
    assert body["suggestions"] == []
    assert "downward arrow" in (body["blocked"] or "").lower()


async def test_an_unapproved_arrow_does_not_count(api, db):
    """A chain that has been started but not approved is not a feared outcome yet."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="Talking to people")
    db.add(DownwardArrow(
        trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
        feared_outcome="They will laugh at me", feared_outcome_approved=False,
    ))
    await db.flush()
    clinician = await _clinician_on(db, org, plan)

    api.sign_in_as(clinician.user)
    body = (await api.post(f"/plans/{plan.id}/triggers/{situation.id}/suggested-steps")).json()

    assert body["blocked"]


async def test_a_situation_on_another_plan_is_refused(api, db):
    """The handler takes a plan id and a situation id from the path. Nothing else ties them."""
    org = await make_org(db)
    mine = await make_plan(db, org)
    theirs = await make_plan(db, org)
    their_situation = await make_situation(db, theirs, name="Their situation")
    clinician = await _clinician_on(db, org, mine)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/plans/{mine.id}/triggers/{their_situation.id}/suggested-steps")

    assert r.status_code == 404


async def test_the_handler_gathers_what_the_prompt_needs(api, db, monkeypatch):
    """The steps already written, and the coping behaviours a suggestion must never contain.

    Stubs the model — this is about what the handler collects and passes on, which is the part that
    was broken.
    """
    seen = {}

    async def fake(**kwargs):
        seen.update(kwargs)
        return ["A smaller version"], "how long, who is there"

    monkeypatch.setattr("app.api.routers.trigger_situations.suggest_steps", fake)

    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="Talking to people")
    situation.distress_thermometer_rating = 7
    db.add_all([
        DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                      feared_outcome="They will laugh at me", feared_outcome_approved=True),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Say hello to one person",
                          behavior_type="scenario"),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Ask a friend to answer",
                          behavior_type="safety"),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Complained of stomach pain",
                          behavior_type="observation"),
    ])
    await db.flush()
    clinician = await _clinician_on(db, org, plan)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/plans/{plan.id}/triggers/{situation.id}/suggested-steps")

    assert r.status_code == 200
    assert r.json()["suggestions"] == ["A smaller version"]
    assert seen["situation"] == "Talking to people"
    assert seen["score"] == 7
    assert seen["feared_outcome"] == "They will laugh at me"
    assert seen["steps"] == ["Say hello to one person"]
    # The safety behaviour goes, because the model has to know what NOT to keep. The observation
    # does not — it was never a behaviour.
    assert seen["coping"] == ["Ask a friend to answer"]
