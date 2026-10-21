"""Combinations: a rung that is the situation without one safety behaviour.

Peter, 2026-10-15, after clinical review with Dr. Walker:

- A safety behaviour makes a combination, and the combination is a rung with its own score.
- An avoidance makes no rung. "It's avoiding the situation."
- The situation itself is not a rung.
- Sub-situations (`scenario`) are still rungs.

Plan: docs/plans/ladder-combinations.md
"""
import pytest

from app.core.behavior_types import LADDER_TYPES, coerce_for_write
from app.models.treatment import AvoidanceBehavior
from app.services import combination_wording
from app.services.avoidance_behavior_service import get_rungs_for_plan

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung,
    make_situation,
)


@pytest.fixture(autouse=True)
def no_model_calls(monkeypatch):
    """`.env` on a laptop can hold a live Anthropic key. These tests never reach the model."""
    monkeypatch.setattr(combination_wording.settings, "ANTHROPIC_API_KEY", "")


async def _setup(db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    situation = await make_situation(db, plan, name="Participating in class verbally", dt=6)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, plan.patient, clinician, owner=True)
    return org, patient, plan, situation, clinician


def _combination(safety, name="Participate in class without sitting at the back", dt=5):
    return {
        "name": name,
        "behavior_type": "combination",
        "without_behavior_id": str(safety.id),
        "distress_thermometer_when_refraining": dt,
    }


# ── The type ─────────────────────────────────────────────────────────────────


def test_a_combination_is_a_rung_and_so_is_a_sub_situation():
    assert LADDER_TYPES == {"scenario", "combination"}


def test_combination_is_accepted_on_the_way_in():
    assert coerce_for_write("combination") == "combination"


# ── Making one ───────────────────────────────────────────────────────────────


async def test_a_safety_behaviour_makes_a_combination_on_the_ladder(api, db):
    org, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    assert r.status_code == 201, r.text
    assert r.json()["without_behavior_id"] == str(safety.id)
    rungs = await get_rungs_for_plan(db, plan.id, org.id)
    assert [x.name for x in rungs] == ["Participate in class without sitting at the back"]


async def test_an_avoidance_makes_no_combination(api, db):
    """Peter, 2026-10-15: "It's avoiding the situation." """
    _, _, _, situation, clinician = await _setup(db)
    avoidance = await make_rung(
        db, situation=situation, name="Doesn't participate verbally", behavior_type="avoidance",
    )

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(avoidance))

    assert r.status_code == 400


async def test_one_combination_per_safety_behaviour(api, db):
    _, _, _, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")

    api.sign_in_as(clinician.user)
    first = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))
    second = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety, name="Again"))

    assert first.status_code == 201
    assert second.status_code == 409


async def test_a_combination_needs_its_safety_behaviour(api, db):
    _, _, _, situation, clinician = await _setup(db)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json={
        "name": "Without what?", "behavior_type": "combination",
    })

    assert r.status_code == 400


async def test_a_combination_cannot_point_at_another_situations_behaviour(api, db):
    """Same 404 whether the row is missing or elsewhere, so it cannot be used to probe for rows."""
    _, _, plan, situation, clinician = await _setup(db)
    elsewhere = await make_situation(db, plan, name="Lunch in the cafeteria")
    safety = await make_rung(db, situation=elsewhere, name="Wears headphones", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    assert r.status_code == 404


async def test_only_a_combination_says_what_it_is_without(api, db):
    _, _, _, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json={
        "name": "Sit in the middle row", "behavior_type": "scenario",
        "without_behavior_id": str(safety.id),
    })

    assert r.status_code == 400


async def test_a_combination_stays_out_of_the_shared_library(api, db):
    """The sentence is this child's situation and behaviour. The library is shared across
    practices and holds generic names only."""
    _, _, _, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    assert r.json()["behavior_library_id"] is None


# ── Changing and removing ────────────────────────────────────────────────────


async def test_a_combination_can_be_reworded_and_rescored(api, db):
    _, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    rung = (await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))).json()

    r = await api.put(f"/plans/{plan.id}/rungs/{rung['id']}", json={
        "name": "Sit in your usual seat and answer a question", "distress_thermometer_when_refraining": 4,
    })

    assert r.status_code == 200
    assert r.json()["name"] == "Sit in your usual seat and answer a question"


@pytest.mark.parametrize("change", [
    {"behavior_type": "scenario"},
    {"trigger_situation_id": None},
])
async def test_a_combination_keeps_its_type_and_its_situation(api, db, change):
    _, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    rung = (await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))).json()

    r = await api.put(f"/plans/{plan.id}/rungs/{rung['id']}", json=change)

    assert r.status_code == 400


async def test_a_row_cannot_become_a_combination_by_retyping(api, db):
    _, _, plan, situation, clinician = await _setup(db)
    rung = await make_rung(db, situation=situation, name="Sit in the middle row", behavior_type="scenario")

    api.sign_in_as(clinician.user)
    r = await api.put(f"/plans/{plan.id}/rungs/{rung.id}", json={"behavior_type": "combination"})

    assert r.status_code == 400


async def test_a_safety_behaviour_with_a_combination_stays_safety(api, db):
    _, _, _, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    r = await api.put(f"/triggers/{situation.id}/behaviors/{safety.id}", json={"behavior_type": "avoidance"})

    assert r.status_code == 409


async def test_removing_the_safety_behaviour_removes_its_combination(api, db):
    """"Without X" means nothing once X is gone."""
    org, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    r = await api.delete(f"/triggers/{situation.id}/behaviors/{safety.id}")

    assert r.status_code == 204
    assert await get_rungs_for_plan(db, plan.id, org.id) == []


# ── The drafted sentence ─────────────────────────────────────────────────────


async def test_the_draft_falls_back_to_the_template_and_writes_nothing(api, db):
    org, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(
        db, situation=situation, name="sits at the back to avoid getting called on", behavior_type="safety",
    )

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    assert r.status_code == 200
    assert r.json() == {
        "sentence": "Participating in class verbally — without: sits at the back to avoid getting called on",
        "drafted_by": "template",
    }
    assert await get_rungs_for_plan(db, plan.id, org.id) == []


class _Reply:
    def __init__(self, text, stop_reason="end_turn"):
        self.content = [type("Block", (), {"type": "text", "text": text})()]
        self.stop_reason = stop_reason


class _Client:
    """Stands in for AsyncAnthropic, so the call's shape is checked without reaching the model."""

    def __init__(self, reply):
        self.reply, self.calls = reply, []
        self.messages = self

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.reply


# Why: the call was split out of draft_sentence so the AI test runner can count its cost
# (AI-dev/evals/runner/step_sentences.py). The app must still send its own prompt and the pair.
async def test_the_wording_call_sends_the_apps_prompt_and_the_pair():
    client = _Client(_Reply("Answer a question in class"))
    text = await combination_wording.ask_claude("In class", "Sits at the back", client=client)
    assert text == "Answer a question in class"
    call = client.calls[0]
    assert call["model"] == combination_wording.MODEL
    assert call["system"] == combination_wording.SYSTEM_PROMPT
    assert call["messages"][0]["content"] == "Situation: In class\nSafety behavior: Sits at the back"


# Why: a refusal must reach draft_sentence as "no sentence", so the clinician gets the template.
async def test_a_refused_draft_falls_back_to_the_template(monkeypatch):
    monkeypatch.setattr(combination_wording.settings, "ANTHROPIC_API_KEY", "sk-test")
    client = _Client(_Reply("", stop_reason="refusal"))
    monkeypatch.setattr("anthropic.AsyncAnthropic", lambda **kw: client)
    assert await combination_wording.draft_sentence("In class", "Sits at the back") == (
        "In class — without: Sits at the back", "template")
    assert client.calls


async def test_the_draft_uses_the_ai_sentence_when_there_is_one(api, db, monkeypatch):
    async def fake(situation, behavior):
        assert (situation, behavior) == ("Participating in class verbally", "Sits at the back")
        return "Answer a question in class without sitting at the back", "ai"

    monkeypatch.setattr("app.api.routers.avoidance_behaviors.draft_sentence", fake)
    _, _, _, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    assert r.json()["drafted_by"] == "ai"


async def test_no_draft_for_an_avoidance(api, db):
    _, _, _, situation, clinician = await _setup(db)
    avoidance = await make_rung(db, situation=situation, name="Doesn't participate", behavior_type="avoidance")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors/{avoidance.id}/combination-draft")

    assert r.status_code == 400


async def test_a_draft_cannot_be_asked_for_with_another_situations_behaviour(api, db):
    _, _, plan, situation, clinician = await _setup(db)
    elsewhere = await make_situation(db, plan, name="Lunch in the cafeteria")
    safety = await make_rung(db, situation=elsewhere, name="Wears headphones", behavior_type="safety")

    api.sign_in_as(clinician.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    assert r.status_code == 404


async def test_a_clinician_without_access_gets_no_draft(api, db):
    org, _, _, situation, _ = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    stranger = await make_practitioner(db, org, name="No grant")

    api.sign_in_as(stranger.user)
    r = await api.post(f"/triggers/{situation.id}/behaviors/{safety.id}/combination-draft")

    assert r.status_code in (403, 404)


# ── The child's app ──────────────────────────────────────────────────────────


async def test_the_child_sees_combinations_and_sub_situations_easiest_first(api, db):
    """Lowest at the top, the same as the clinician's ladder (Peter, 2026-10-15)."""
    org, patient, plan, situation, _ = await _setup(db)
    plan.ladder_active = True
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety", dt=None)
    combination = AvoidanceBehavior(
        trigger_situation_id=situation.id, treatment_plan_id=plan.id, organization_id=org.id,
        name="Participate in class without sitting at the back", behavior_type="combination",
        distress_thermometer_when_refraining=5, without_behavior_id=safety.id,
    )
    db.add(combination)
    await db.flush()
    await make_rung(
        db, situation=situation, name="Participate in class sitting in the middle row",
        behavior_type="scenario", dt=4, parent=combination,
    )
    await make_rung(db, situation=situation, name="Doesn't participate", behavior_type="avoidance", dt=6)

    api.sign_in_as(patient.user)
    body = (await api.get("/patient/ladder")).json()

    assert [r["name"] for r in body["rungs"]] == [
        "Participate in class sitting in the middle row",
        "Participate in class without sitting at the back",
    ]


# ── Another patient's situation ──────────────────────────────────────────────
# Found while building this. The situation in these requests comes from the body, so the access
# check on the plan in the path said nothing about it. A step could be put under another patient's
# situation in the same practice and would then show on that child's ladder.


async def _two_patients(db):
    org = await make_org(db)
    mine = await make_plan(db, org, patient=await make_patient(db, org))
    theirs = await make_plan(db, org, patient=await make_patient(db, org, name="Other child"))
    my_situation = await make_situation(db, mine, name="Mine")
    their_situation = await make_situation(db, theirs, name="Theirs")
    me = await make_practitioner(db, org)
    await grant_patient_to(db, mine.patient, me, owner=True)
    return mine, my_situation, their_situation, me


async def test_a_new_rung_cannot_go_under_another_patients_situation(api, db):
    mine, _, their_situation, me = await _two_patients(db)

    api.sign_in_as(me.user)
    r = await api.post(f"/plans/{mine.id}/rungs", json={
        "name": "x", "behavior_type": "scenario", "trigger_situation_id": str(their_situation.id),
    })

    assert r.status_code == 404


async def test_a_rung_cannot_be_moved_under_another_patients_situation(api, db):
    mine, my_situation, their_situation, me = await _two_patients(db)
    rung = await make_rung(db, situation=my_situation, name="Mine", behavior_type="scenario")

    api.sign_in_as(me.user)
    on_ladder = await api.put(f"/plans/{mine.id}/rungs/{rung.id}", json={
        "trigger_situation_id": str(their_situation.id),
    })
    on_situation = await api.put(f"/triggers/{my_situation.id}/behaviors/{rung.id}", json={
        "trigger_situation_id": str(their_situation.id),
    })

    assert on_ladder.status_code == 404
    assert on_situation.status_code == 404


async def test_a_rung_can_still_move_between_situations_on_the_same_plan(api, db):
    mine, my_situation, _, me = await _two_patients(db)
    other_of_mine = await make_situation(db, mine, name="Also mine")
    rung = await make_rung(db, situation=my_situation, name="Mine", behavior_type="scenario")

    api.sign_in_as(me.user)
    r = await api.put(f"/plans/{mine.id}/rungs/{rung.id}", json={
        "trigger_situation_id": str(other_of_mine.id),
    })

    assert r.status_code == 200
    assert r.json()["trigger_situation_id"] == str(other_of_mine.id)


# ── Review fixes ─────────────────────────────────────────────────────────────


async def test_a_safety_behaviour_with_a_combination_stays_with_its_situation(api, db):
    _, _, plan, situation, clinician = await _setup(db)
    other = await make_situation(db, plan, name="Lunch in the cafeteria")
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))

    moved = await api.put(f"/plans/{plan.id}/rungs/{safety.id}", json={"trigger_situation_id": str(other.id)})
    ungrouped = await api.put(f"/plans/{plan.id}/rungs/{safety.id}", json={"trigger_situation_id": None})

    assert moved.status_code == 409
    assert ungrouped.status_code == 409


async def test_sending_a_combinations_own_situation_back_is_fine(api, db):
    """A client that sends the whole rung back on edit must still be able to rename it."""
    _, _, plan, situation, clinician = await _setup(db)
    safety = await make_rung(db, situation=situation, name="Sits at the back", behavior_type="safety")
    api.sign_in_as(clinician.user)
    rung = (await api.post(f"/triggers/{situation.id}/behaviors", json=_combination(safety))).json()

    r = await api.put(f"/plans/{plan.id}/rungs/{rung['id']}", json={
        "name": "Reworded", "trigger_situation_id": str(situation.id),
    })

    assert r.status_code == 200
