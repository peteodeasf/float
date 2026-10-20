"""The limits on suggested rungs are checked in code, not only asked for in the prompt.

Until 2026-10-20 the prompt asked for two to five suggestions of about twelve words, and nothing
checked. A reply with nine suggestions, or one long sentence, went straight to the clinician. The
model is replaced here, so nothing is spent.
"""
import json

import pytest

from app.services import step_suggestion_service as svc
from app.services.step_suggestion_service import (
    MAX_SUGGESTIONS, MAX_WORDS_PER_SUGGESTION, MIN_SUGGESTIONS, SuggestionUnavailable,
    suggest_steps, within_limits,
)


def _reply(monkeypatch, suggestions, variations="where you sit"):
    monkeypatch.setattr(svc, "ask_claude", lambda context, client=None: json.dumps(
        {"suggestions": suggestions, "variations": variations}))


async def _suggest():
    return await suggest_steps(situation="Eating lunch in the cafeteria", score=7,
                               feared_outcome="", steps=[], coping=[])


def test_the_numbers_are_the_ones_in_the_plan():
    # docs/plans/ladder-generation.md, "How many suggestions": two to five. If someone changes
    # these, the plan and the prompt have to change with them.
    assert (MIN_SUGGESTIONS, MAX_SUGGESTIONS, MAX_WORDS_PER_SUGGESTION) == (2, 5, 12)
    assert "between two and five suggestions" in svc.SYSTEM_PROMPT
    assert "twelve words or fewer" in svc.SYSTEM_PROMPT


async def test_too_many_keeps_the_first_five(monkeypatch):
    # A model told "two to five" can still write eight. The clinician sees five, in the model's
    # order.
    _reply(monkeypatch, [f"Step number {n}" for n in range(1, 9)])
    suggestions, variations = await _suggest()
    assert suggestions == [f"Step number {n}" for n in range(1, 6)]
    assert variations == "where you sit"


async def test_one_suggestion_is_not_shown(monkeypatch):
    # Fewer than two is below the plan's floor. The clinician gets the "not enough" sentence
    # instead of a single chip.
    _reply(monkeypatch, ["Imagine eating lunch in the cafeteria"])
    with pytest.raises(SuggestionUnavailable, match="Not enough"):
        await _suggest()


async def test_none_at_all_says_nothing_came_back(monkeypatch):
    # The sentence the clinician saw before this change, kept for the empty case.
    _reply(monkeypatch, ["", "  "])
    with pytest.raises(SuggestionUnavailable, match="Nothing came back"):
        await _suggest()


async def test_a_long_one_is_dropped_and_the_rest_are_shown(monkeypatch):
    # Thirteen words breaks the chip's two lines. Dropping it is better than cutting it off
    # half-way through a sentence a child reads.
    long_one = "Eat lunch in the cafeteria for ten minutes at a table near the door"
    assert len(long_one.split()) == MAX_WORDS_PER_SUGGESTION + 2
    _reply(monkeypatch, ["Imagine lunch in the cafeteria", long_one, "Watch a video of a cafeteria"])
    suggestions, _ = await _suggest()
    assert suggestions == ["Imagine lunch in the cafeteria", "Watch a video of a cafeteria"]


async def test_too_long_leaving_one_is_not_enough(monkeypatch):
    # The floor is counted after the limits, not before.
    _reply(monkeypatch, ["Imagine lunch in the cafeteria", "word " * 13])
    with pytest.raises(SuggestionUnavailable, match="Not enough"):
        await _suggest()


def test_twelve_words_is_allowed():
    # The limit is "twelve or fewer", so exactly twelve stays.
    twelve = " ".join(["word"] * MAX_WORDS_PER_SUGGESTION)
    assert within_limits([twelve, "Something else"]) == ([twelve, "Something else"], [])


def test_the_same_idea_twice_is_dropped():
    # Same words apart from "the", "a" and capitals: one idea written twice.
    kept, dropped = within_limits(["Eat lunch in the cafeteria", "eat lunch in a cafeteria.",
                                   "Watch others eat lunch"])
    assert kept == ["Eat lunch in the cafeteria", "Watch others eat lunch"]
    assert dropped == [("eat lunch in a cafeteria.", "duplicate")]


def test_one_word_that_matters_keeps_both():
    # checks.py's warning for why duplicates cannot be judged by overlap: "with" and "without" the
    # fan are different suggestions. Only identical wording counts as the same idea.
    kept, dropped = within_limits(["Sit on the bench with the fan", "Sit on the bench without the fan"])
    assert len(kept) == 2 and dropped == []


def test_a_duplicate_does_not_use_up_one_of_the_five():
    # Duplicates and long ones go first, so the five slots go to five real suggestions.
    kept, dropped = within_limits(["One", "one", "Two", "Three", "Four", "Five", "Six"])
    assert kept == ["One", "Two", "Three", "Four", "Five"]
    assert dropped == [("one", "duplicate"), ("Six", "over_max")]
