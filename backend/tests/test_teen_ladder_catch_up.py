"""The child's app after the ladder change: what the step detail tells it, and what it can reach.

Plan: docs/plans/teen-app-ladder-catch-up.md
"""
from datetime import datetime, timedelta, timezone

from app.models.downward_arrow import DownwardArrow

from tests.factories import make_org, make_patient, make_plan, make_rung, make_situation


async def _child(db, org, *, active=True):
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    plan.ladder_active = active
    await db.flush()
    return patient, plan


async def test_the_step_detail_says_whether_the_ladder_is_on(api, db):
    org = await make_org(db)
    patient, plan = await _child(db, org, active=False)
    situation = await make_situation(db, plan)
    rung = await make_rung(db, situation=situation, behavior_type="scenario")

    api.sign_in_as(patient.user)
    assert (await api.get(f"/patient/behaviors/{rung.id}")).json()["ladder_active"] is False

    plan.ladder_active = True
    await db.flush()
    assert (await api.get(f"/patient/behaviors/{rung.id}")).json()["ladder_active"] is True


async def test_a_new_situation_does_not_block_the_exposure(api, db):
    """New situations are created with the old per-situation flag off, and the exposure screen sent
    the child home when it saw that. The step detail no longer carries the flag; the screen reads
    the ladder switch instead."""
    org = await make_org(db)
    patient, plan = await _child(db, org, active=True)
    situation = await make_situation(db, plan)
    assert situation.is_active is False
    rung = await make_rung(db, situation=situation, behavior_type="scenario")

    api.sign_in_as(patient.user)
    body = (await api.get(f"/patient/behaviors/{rung.id}")).json()
    assert body["ladder_active"] is True
    assert "is_active" not in body["situation"]


async def test_two_arrows_on_one_situation_do_not_break_the_home(api, db):
    org = await make_org(db)
    patient, plan = await _child(db, org)
    situation = await make_situation(db, plan)
    rung = await make_rung(db, situation=situation, behavior_type="scenario")
    db.add_all([
        DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                      feared_outcome="The old answer",
                      updated_at=datetime.now(timezone.utc) - timedelta(days=2)),
        DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                      feared_outcome="The newer answer"),
    ])
    await db.flush()

    api.sign_in_as(patient.user)
    r = await api.get("/patient/ladder")
    assert r.status_code == 200, r.text
    assert r.json()["rungs"][0]["feared_outcome"] == "The newer answer"
    r = await api.get(f"/patient/behaviors/{rung.id}")
    assert r.status_code == 200, r.text
    assert r.json()["situation"]["feared_outcome"] == "The newer answer"


async def test_the_child_sees_a_feared_outcome_the_clinician_did_not_press_save_on(api, db):
    """Peter, 2026-09-10: if the arrow has been done, the child sees it."""
    org = await make_org(db)
    patient, plan = await _child(db, org)
    situation = await make_situation(db, plan)
    rung = await make_rung(db, situation=situation, behavior_type="scenario")
    db.add(DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id,
                         arrow_steps=[], feared_outcome="Everyone will laugh at me",
                         feared_outcome_approved=False))
    await db.flush()

    api.sign_in_as(patient.user)
    ladder = (await api.get("/patient/ladder")).json()
    assert ladder["rungs"][0]["feared_outcome"] == "Everyone will laugh at me"
    detail = (await api.get(f"/patient/behaviors/{rung.id}")).json()
    assert detail["situation"]["feared_outcome"] == "Everyone will laugh at me"


async def test_a_step_with_no_situation_opens(api, db):
    org = await make_org(db)
    patient, plan = await _child(db, org)
    rung = await make_rung(db, plan=plan, behavior_type="scenario", name="Wave from the gate")

    api.sign_in_as(patient.user)
    r = await api.get(f"/patient/behaviors/{rung.id}")
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Wave from the gate"
    assert r.json()["situation"] is None


async def test_another_childs_step_is_refused(api, db):
    """The boundary. Both kinds of step — with a situation and without."""
    org = await make_org(db)
    me, _ = await _child(db, org)
    _, their_plan = await _child(db, org)
    their_situation = await make_situation(db, their_plan)
    grouped = await make_rung(db, situation=their_situation, behavior_type="scenario")
    ungrouped = await make_rung(db, plan=their_plan, behavior_type="scenario")

    api.sign_in_as(me.user)
    assert (await api.get(f"/patient/behaviors/{grouped.id}")).status_code == 404
    assert (await api.get(f"/patient/behaviors/{ungrouped.id}")).status_code == 404


async def test_a_step_pointing_at_someone_elses_situation_is_refused(api, db):
    """A row whose plan link is mine but whose situation is on another plan must not hand back
    that situation's name and feared outcome."""
    org = await make_org(db)
    me, my_plan = await _child(db, org)
    _, their_plan = await _child(db, org)
    their_situation = await make_situation(db, their_plan, name="Their situation")
    odd = await make_rung(db, situation=their_situation, plan=my_plan, behavior_type="scenario")

    api.sign_in_as(me.user)
    assert (await api.get(f"/patient/behaviors/{odd.id}")).status_code == 404


async def test_the_parents_observations_do_not_reach_the_child(api, db):
    """Observations came out of the parent's monitoring log — "Complained of stomach pain". They
    were in the child's ladder payload, just not drawn."""
    org = await make_org(db)
    patient, plan = await _child(db, org)
    situation = await make_situation(db, plan)
    await make_rung(db, situation=situation, behavior_type="scenario", name="Walk in on my own")
    obs = await make_rung(db, situation=situation, behavior_type="observation",
                          name="Complained of stomach pain")

    api.sign_in_as(patient.user)
    body = (await api.get("/patient/ladder")).json()
    names = [b["name"] for s in body["situations"] for b in s["behaviors"]]
    assert "Complained of stomach pain" not in names
    assert "Walk in on my own" in names
    assert (await api.get(f"/patient/behaviors/{obs.id}")).status_code == 404


async def test_the_parents_downward_arrow_is_not_shown_to_the_child(api, db):
    """A situation can hold an arrow run with the parent and one run with the child. The parent's
    answer is their guess at the child's fear, not something the child said — even when it is the
    newer of the two."""
    org = await make_org(db)
    patient, plan = await _child(db, org)
    situation = await make_situation(db, plan)
    rung = await make_rung(db, situation=situation, behavior_type="scenario")
    db.add_all([
        DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                      feared_outcome="What the child said", facilitated_by="practitioner",
                      updated_at=datetime.now(timezone.utc) - timedelta(days=2)),
        DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                      feared_outcome="What the parent thinks", facilitated_by="parent"),
    ])
    await db.flush()

    api.sign_in_as(patient.user)
    assert (await api.get("/patient/ladder")).json()["rungs"][0]["feared_outcome"] == "What the child said"
    detail = (await api.get(f"/patient/behaviors/{rung.id}")).json()
    assert detail["situation"]["feared_outcome"] == "What the child said"


async def test_a_parent_only_arrow_shows_the_child_nothing(api, db):
    org = await make_org(db)
    patient, plan = await _child(db, org)
    situation = await make_situation(db, plan)
    rung = await make_rung(db, situation=situation, behavior_type="scenario")
    db.add(DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id, arrow_steps=[],
                         feared_outcome="What the parent thinks", facilitated_by="parent",
                         feared_outcome_approved=True))
    await db.flush()

    api.sign_in_as(patient.user)
    detail = (await api.get(f"/patient/behaviors/{rung.id}")).json()
    assert detail["situation"]["feared_outcome"] is None


async def test_a_placeholder_situation_is_not_sent_to_the_child(api, db):
    org = await make_org(db)
    patient, plan = await _child(db, org)
    placeholder = await make_situation(db, plan, name="(placeholder)", is_placeholder=True)
    await make_rung(db, situation=placeholder, behavior_type="scenario", name="Hidden step")

    api.sign_in_as(patient.user)
    body = (await api.get("/patient/ladder")).json()
    assert all(s["name"] != "(placeholder)" for s in body["situations"])
    assert all(r["name"] != "Hidden step" for r in body["rungs"])
