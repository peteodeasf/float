"""The Ladder Validation list in the ladder editor. Peter, 2026-10-29: say "rung" and "Fear Level",
and use his wording. Peter, 2026-11-02: one short bold label per bullet, concise text, and two new
rules — at least 2 low rungs, and mostly go up 1 at a time. Pure arithmetic, so no database."""
from app.services.ladder_review_service import review_steps


def messages(steps):
    return {f.code: f.message for f in review_steps(steps)}


def codes(steps):
    return [f.code for f in review_steps(steps)]


# ── Nothing scored ─────────────────────────────────────────────────────────────

def test_nothing_with_a_fear_level():
    # With no Fear Level anywhere there is no order, so the clinician is told how a rung gets on.
    # Only this bullet, and the unscored one, show: the other checks have nothing to check.
    got = review_steps([("Walk in", None)])
    assert [f.code for f in got] == ["NO_SCORED_STEPS", "UNSCORED_STEPS"]
    assert got[0].label == "Nothing on the ladder yet"
    assert got[0].message == (
        "Nothing on the ladder yet: add a situation, add a behavior under it, and give the "
        "behavior a Fear Level."
    )


def test_an_empty_ladder_shows_only_nothing_on_the_ladder():
    # No rungs at all: there is nothing unscored to name, so the single bullet is the whole list.
    assert codes([]) == ["NO_SCORED_STEPS"]


# ── No Fear Level ──────────────────────────────────────────────────────────────

def test_one_rung_with_no_fear_level():
    # Singular reads "Give it", not "Give each one".
    got = messages([("Walk in", None), ("A", 2), ("B", 3), ("C", 4)])["UNSCORED_STEPS"]
    assert got == "No Fear Level: “Walk in”. Give it a Fear Level."


def test_several_rungs_with_no_fear_level_name_the_first_three():
    # More than three names would run on; the rest are cut with an ellipsis.
    got = messages([("A", None), ("B", None), ("C", None), ("D", None), ("E", 2)])["UNSCORED_STEPS"]
    assert got == "No Fear Level: “A”, “B”, “C”… Give each one a Fear Level."


def test_unscored_rungs_are_left_out_of_the_other_checks():
    # A missing Fear Level is not a zero: these two would otherwise count as low rungs and pass.
    got = codes([("A", None), ("B", None), ("C", 5), ("D", 6), ("E", 7)])
    assert "FEW_LOW_RUNGS" in got
    assert "INSUFFICIENT_RUNGS" not in got


# ── Low rungs ──────────────────────────────────────────────────────────────────

def test_two_low_rungs_pass():
    # The rule is at least 2 rungs at Fear Level 4 or lower; 4 itself counts.
    assert "FEW_LOW_RUNGS" not in codes([("A", 3), ("B", 4), ("C", 5)])


def test_one_low_rung_flags_and_asks_for_one_more():
    assert messages([("A", 2), ("B", 5), ("C", 6)])["FEW_LOW_RUNGS"] == (
        "Low rungs: 1 of the 2 needed at Fear Level 4 or lower. Add 1 more."
    )


def test_no_low_rungs_flags_and_asks_for_two_more():
    assert messages([("A", 5), ("B", 6), ("C", 7)])["FEW_LOW_RUNGS"] == (
        "Low rungs: 0 of the 2 needed at Fear Level 4 or lower. Add 2 more."
    )


def test_a_low_lowest_rung_is_not_enough_on_its_own():
    # The old rule passed any ladder whose lowest rung was 4 or below. The new one needs two.
    assert "FEW_LOW_RUNGS" in codes([("A", 3), ("B", 5), ("C", 6)])


# ── Going up ───────────────────────────────────────────────────────────────────

def test_jumps_over_one_are_listed_in_one_bullet():
    # Neighbors by Fear Level, not by input order. Every jump over 1 goes in the same bullet.
    got = review_steps([("Z", 9), ("X", 4), ("W", 3), ("Y", 7)])
    jumps = [f for f in got if f.code == "BIG_JUMPS"]
    assert len(jumps) == 1
    assert jumps[0].message == (
        "Going up: mostly go up 1 at a time. Bigger jumps here: “X” (4) to “Y” (7), “Y” (7) to “Z” (9)."
    )


def test_more_than_three_jumps_are_cut_at_three():
    # Four jumps over 1: the first three show, then an ellipsis.
    got = messages([("A", 1), ("B", 3), ("C", 5), ("D", 7), ("E", 9)])["BIG_JUMPS"]
    assert got == (
        "Going up: mostly go up 1 at a time. Bigger jumps here: “A” (1) to “B” (3), "
        "“B” (3) to “C” (5), “C” (5) to “D” (7)…"
    )


def test_all_jumps_of_one_give_no_bullet():
    # Going up 1 at a time is the recommendation, so a ladder that does it has nothing to say.
    # Decimals too: 1.2 to 2.2 is a jump of 1, not 1.0000000000000002.
    assert "BIG_JUMPS" not in codes([("A", 1), ("B", 2), ("C", 3), ("D", 4)])
    assert "BIG_JUMPS" not in codes([("A", 1.2), ("B", 2.2), ("C", 3.2)])


def test_a_big_jump_is_advice_not_an_error():
    # Peter, 2026-11-02: "there's no limit". A jump of 8 is listed like any other, with no
    # "too big", "keep to" or maximum in the wording.
    got = messages([("A", 1), ("B", 2), ("C", 10)])["BIG_JUMPS"]
    assert got == "Going up: mostly go up 1 at a time. Bigger jumps here: “B” (2) to “C” (10)."
    for word in ("too", "keep", "limit", "max", "must", "or less"):
        assert word not in got.lower()


def test_decimal_fear_levels_use_the_same_number_formatting():
    # :g, as before: 2.5 shows as 2.5, 4.0 as 4.
    got = messages([("A", 2.5), ("B", 4.0), ("C", 5)])["BIG_JUMPS"]
    assert "“A” (2.5) to “B” (4)" in got


# ── Too few rungs ──────────────────────────────────────────────────────────────

def test_too_few_rungs():
    # Peter, 2026-11-02: the minimum is two for now. Only rungs with a Fear Level count towards it.
    assert messages([("A", 2)])["INSUFFICIENT_RUNGS"] == "Too few rungs: at least 2 needed. Add at least 1 more."
    assert messages([("A", 2), ("B", None)])["INSUFFICIENT_RUNGS"] == (
        "Too few rungs: at least 2 needed. Add at least 1 more."
    )
    assert "INSUFFICIENT_RUNGS" not in codes([("A", 2), ("B", 3)])


def test_too_few_rungs_is_the_only_count_shown():
    # Peter, 2026-11-02: one rung used to get both "Add 1 more" and "Aim for at least 3". A clinician
    # should not be told two numbers, so Low rungs waits until there are enough rungs.
    assert codes([("A", 2)]) == ["INSUFFICIENT_RUNGS"]
    assert codes([("A", 7)]) == ["INSUFFICIENT_RUNGS"]
    assert "FEW_LOW_RUNGS" in codes([("A", 3), ("B", 5)])


# ── The list as a whole ────────────────────────────────────────────────────────

def test_the_bullets_come_in_peters_order():
    # No Fear Level, Low rungs, Going up. Too few rungs replaces Low rungs when it applies.
    assert codes([("A", None), ("B", 6), ("C", 9)]) == ["UNSCORED_STEPS", "FEW_LOW_RUNGS", "BIG_JUMPS"]
    assert codes([("A", None), ("B", 6)]) == ["UNSCORED_STEPS", "INSUFFICIENT_RUNGS"]


def test_a_good_ladder_has_no_bullets():
    # Nothing to say means Save ladder just closes.
    assert review_steps([("A", 2), ("B", 3), ("C", 4), ("D", 5)]) == []


def test_every_bullet_has_a_label_and_text():
    # The screen bolds the label, so each one needs both, and `message` is the two joined.
    for f in review_steps([("A", None), ("B", 6), ("C", 9)]):
        assert f.label and f.text
        assert f.message == f"{f.label}: {f.text}"


def test_no_message_says_step_or_thermometer():
    # Peter, 2026-10-29: "rung" on screen, and Fear Level, not thermometer score.
    every = review_steps([("A", None), ("B", 6), ("C", 10)]) + review_steps([("A", None)])
    assert every
    for f in every:
        assert "step" not in f.message.lower()
        assert "thermometer" not in f.message.lower()
