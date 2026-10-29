"""The "Before you finish" messages in the ladder editor. Peter, 2026-10-29: say "rung" and
"Fear Level", and use his wording. Pure arithmetic, so no database."""
from app.services.ladder_review_service import review_steps


def messages(steps):
    return {f.code: f.message for f in review_steps(steps)}


def test_nothing_with_a_fear_level():
    # With no Fear Level anywhere there is no order, so the clinician is told how a rung gets on.
    assert messages([("Walk in", None)])["NO_SCORED_STEPS"] == (
        "Nothing is on the ladder yet. Add a situation, add a behavior under it, and give the behavior a Fear Level. It then shows on the ladder as a rung."
    )


def test_one_rung_with_no_fear_level():
    # Singular reads "1 rung has … it's", not "1 rungs have".
    got = messages([("Walk in", None), ("A", 2), ("B", 3), ("C", 4)])["UNSCORED_STEPS"]
    assert got == (
        "1 rung has no Fear Level yet, so it’s not on the ladder: Walk in. "
        "Give it a Fear Level to place it."
    )


def test_several_rungs_with_no_fear_level_name_the_first_three():
    # More than three names would run on; the rest are cut with an ellipsis, as before.
    got = messages([("A", None), ("B", None), ("C", None), ("D", None), ("E", 2)])["UNSCORED_STEPS"]
    assert got == (
        "4 rungs have no Fear Level yet, so they’re not on the ladder: A, B, C… "
        "Give each one a Fear Level to place it."
    )


def test_too_few_rungs():
    # Only rungs with a Fear Level count towards the minimum; singular for one.
    assert messages([("A", 2)])["INSUFFICIENT_RUNGS"] == (
        "The ladder has 1 rung. Aim for at least 3, so the child can build up gradually. "
        "Add rungs in between."
    )
    assert messages([("A", 2), ("B", 3)])["INSUFFICIENT_RUNGS"].startswith("The ladder has 2 rungs.")


def test_starts_too_high():
    # The lowest rung is named with its Fear Level and the limit, from LADDER_RULES.
    assert messages([("Walk in", 6), ("B", 7), ("C", 8)])["STARTING_DISTRESS_TOO_HIGH"] == (
        "The lowest rung, “Walk in”, is a 6. Start at 4 or below. A smaller rung usually exists: "
        "imagining it, or watching someone else do it."
    )


def test_a_big_jump():
    # Names both rungs with their Fear Levels, and the largest jump allowed.
    assert messages([("A", 2), ("B", 3), ("C", 7)])["RUNG_GAP_TOO_LARGE"] == (
        "There’s a jump of 4 from “B” (3) to “C” (7). Keep jumps to 2 or less. "
        "A rung in between makes it easier to climb."
    )


def test_no_message_says_step_or_thermometer():
    # Peter, 2026-10-29: "rung" on screen, and Fear Level, not thermometer score.
    every = review_steps([("A", None), ("B", 6), ("C", 10)])
    assert every
    for f in every:
        assert "step" not in f.message.lower()
        assert "thermometer" not in f.message.lower()
