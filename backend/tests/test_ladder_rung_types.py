"""What a row on the ladder is allowed to say it is.

`behavior_type` is a free string column and had drifted to 11 values across 136 rows in production
by 2026-09-01 — three spellings of "safety", and six that were not behaviours at all. Those six
came out of monitoring extraction and read like it: "Complained of stomach pain", "Expressed fear
of peer ridicule". They were appearing as rungs on a clinician's ladder.

Plan: docs/plans/exposure-ladder-sub-situations.md
"""
import pytest
from fastapi import HTTPException

from app.core.behavior_types import coerce_for_write, normalise
from app.models.treatment import AvoidanceBehavior
from app.services.avoidance_behavior_service import get_rungs_for_plan

from tests.factories import make_org, make_plan, make_situation


# ── Folding what is already stored ───────────────────────────────────────────


@pytest.mark.parametrize("stored", ["safety_behavior", "safety_seeking", "SAFETY", " safety "])
def test_every_spelling_of_safety_folds_onto_one(stored):
    assert normalise(stored) == "safety"


@pytest.mark.parametrize(
    "stored",
    ["physical_symptom", "cognitive", "anxious_cognition", "anxiety_response", "anxiety",
     "rumination"],
)
def test_the_things_that_are_not_behaviours_become_observations(stored):
    assert normalise(stored) == "observation"


def test_something_nobody_planned_for_is_an_observation_not_a_rung():
    """Guessing this way costs a re-type. Guessing the other way puts a stomach ache on a child's
    ladder."""
    assert normalise("wibble") == "observation"


def test_a_missing_type_is_an_observation():
    assert normalise(None) == "observation"
    assert normalise("") == "observation"


# ── Writing a new row ────────────────────────────────────────────────────────


@pytest.mark.parametrize("value", ["scenario", "avoidance", "safety", "ritual", "observation"])
def test_the_canonical_five_are_accepted(value):
    assert coerce_for_write(value) == value


def test_an_old_spelling_from_the_shared_library_still_works():
    """The clinician's add form copies the type off a library suggestion, and the library may still
    hold an old spelling."""
    assert coerce_for_write("safety_seeking") == "safety"


def test_an_unknown_type_is_refused_rather_than_quietly_hidden():
    """The opposite of `normalise`. On the way in, an unrecognised value is a bug — turning it into
    an observation would take the clinician's rung off the ladder without saying so."""
    with pytest.raises(HTTPException) as e:
        coerce_for_write("physical_symptom")
    assert e.value.status_code == 400


# ── What the ladder returns ──────────────────────────────────────────────────


async def test_only_a_version_of_the_situation_is_a_rung(db):
    """Peter, 2026-09-01: a rung is a smaller version of the situation and nothing else.

    A safety behaviour is a thing to stop before the exposures — it belongs to the situation, not
    to the ladder. An observation was never a behaviour. An avoidance is what the situation IS.
    """
    org = await make_org(db)
    plan = await make_plan(db, org)
    situation = await make_situation(db, plan, name="School drop off")

    db.add_all([
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Walk in by myself",
                          behavior_type="scenario"),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Ask mum to wait",
                          behavior_type="safety"),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Avoids school drop off",
                          behavior_type="avoidance"),
        AvoidanceBehavior(trigger_situation_id=situation.id, organization_id=org.id,
                          treatment_plan_id=plan.id, name="Complained of stomach pain",
                          behavior_type="observation"),
    ])
    await db.flush()

    names = {r.name for r in await get_rungs_for_plan(db, plan.id, org.id)}

    assert names == {"Walk in by myself"}
