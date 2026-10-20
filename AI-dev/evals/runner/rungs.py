"""Suggested rungs: the smaller versions of a situation Claude offers in the ladder editor, as
`step_suggestion_service.suggest_steps` returns them.

From the app, not copied:
  * the prompt: step_suggestion_service.SYSTEM_PROMPT
  * the input text: step_suggestion_service._context_block
  * the call: step_suggestion_service.ask_claude (model, token limit, no temperature set)
  * reading the reply: step_suggestion_service.read_reply
  * what is shown: step_suggestion_service.within_limits, and fewer than MIN_SUGGESTIONS left shows
    none

There is no right answer to score against. What this counts is form: how many suggestions the model
wrote, how many the limits let through, and why the others were dropped. Whether a suggestion is any
good is the reviewers' job (a later item).

Each situation with a feared outcome is run twice: once given it ("with") and once told it is not
known ("without"). Peter dropped the feared outcome as a requirement on 2026-10-16 to test exactly
this. Situations whose family has no feared outcome at all are run once ("none"), which is how the
app sees most situations before a downward arrow.
"""
import functools
import importlib.util

import app_code

NAME = "rungs"
MODES = ("with", "without", "none")

_LADDER_CHECKS = app_code.ROOT / "AI-dev" / "Ladder Eval" / "checks.py"


@functools.cache
def _ladder_checks():
    """`AI-dev/Ladder Eval/checks.py`, loaded under its own name: float_harness has a `checks.py`
    too."""
    spec = importlib.util.spec_from_file_location("ladder_eval_checks", _LADDER_CHECKS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def app_prompt() -> str:
    from app.services.step_suggestion_service import SYSTEM_PROMPT
    return SYSTEM_PROMPT


def model() -> str:
    from app.services.step_suggestion_service import SUGGESTION_MODEL
    return SUGGESTION_MODEL


def prepare(case) -> dict:
    from app.services.step_suggestion_service import _context_block
    i = case.input
    return {"context": _context_block(situation=i["situation"], score=i["score"],
                                      feared_outcome=i["feared_outcome"], steps=i["steps"],
                                      coping=i["coping"])}


def call(client, prepared) -> str:
    from app.services.step_suggestion_service import ask_claude
    return ask_claude(prepared["context"], client=client)


def read(raw: str):
    from app.services.step_suggestion_service import read_reply
    try:
        suggestions, variations = read_reply(raw)
    except Exception:
        return None
    return {"suggestions": suggestions, "variations": variations}


def _same_words(a: str, b: str) -> bool:
    from app.services.step_suggestion_service import _idea
    return _idea(a) == _idea(b)


def checks(case, prepared, parsed) -> dict[str, list[str]]:
    """Pass/fail code checks on what the model wrote, before the app's limits. A failure here is the
    prompt's rule not being followed; the app then drops or hides what breaks it."""
    from app.services.step_suggestion_service import (
        MAX_SUGGESTIONS, MIN_SUGGESTIONS,
    )
    if parsed is None:
        return {"app_can_read": ["the app's reader could not read the reply"]}
    written = parsed["suggestions"]
    n = len(written)
    plain_ok, plain_why = _ladder_checks().plain_enough_for_a_child(written)
    return {
        "app_can_read": [],
        "two_to_five": [] if MIN_SUGGESTIONS <= n <= MAX_SUGGESTIONS
        else [f"{n} suggestions; wanted {MIN_SUGGESTIONS}-{MAX_SUGGESTIONS}"],
        "no_idea_twice": [f"suggestions {i + 1} and {j + 1}" for i in range(n) for j in range(i + 1, n)
                          if _same_words(written[i], written[j])],
        # Ladder Eval's list of words for a clinician's notes, not a child's screen.
        "plain_enough_for_a_child": [] if plain_ok else [plain_why],
    }


METRICS = ("runs", "written", "shown", "dropped_duplicate", "dropped_over_max",
           "none_shown", "words_shown", "variations_given")


def score(case, prepared, parsed) -> dict:
    """Counts, kept apart by mode so the report can set "with" beside "without".

    runs              -- 1 per run, so totals say how many runs they are out of
    written           -- suggestions in the model's reply
    shown             -- of those, how many the clinician would see. 0 when fewer than
                         MIN_SUGGESTIONS survive the limits, because then none are shown
    dropped_duplicate -- dropped for having the same words as an earlier one
    dropped_over_max  -- dropped for coming after the fifth
    none_shown        -- 1 when the clinician would see none
    words_shown       -- words in the suggestions shown, so words_shown/shown is the average length
    variations_given  -- 1 when the "other variations" line is not empty

    Each is written as "<metric>_<mode>", and 0 under the other two modes. "written", "shown" and
    "dropped" without a mode are for the per-case table.
    """
    from app.services.step_suggestion_service import MIN_SUGGESTIONS, within_limits, words_in
    kept, dropped = within_limits(parsed["suggestions"])
    shown = kept if len(kept) >= MIN_SUGGESTIONS else []
    reasons = [r for _, r in dropped]
    m = {
        "runs": 1,
        "written": len(parsed["suggestions"]),
        "shown": len(shown),
        "dropped_duplicate": reasons.count("duplicate"),
        "dropped_over_max": reasons.count("over_max"),
        "none_shown": int(not shown),
        "words_shown": sum(words_in(s) for s in shown),
        "variations_given": int(bool(parsed["variations"])),
    }
    mode = case.expected["mode"]
    out = {f"{k}_{md}": (v if md == mode else 0) for k, v in m.items() for md in MODES}
    out.update(written=m["written"], shown=m["shown"], dropped=len(dropped),
               signature=f"shown={len(shown)}")
    return out


SUMMED = tuple(f"{k}_{md}" for k in METRICS for md in MODES) + ("written", "shown", "dropped")

_MODE_TEXT = {
    "with": "given the feared outcome",
    "without": "same situations, told it is not known",
    "none": "situations with no feared outcome",
}
SCORES = tuple(
    row
    for md in MODES
    for row in (
        (f"Runs ({_MODE_TEXT[md]})", f"runs_{md}", None),
        ("... suggestions written", f"written_{md}", None),
        ("... shown, of those written", f"shown_{md}", f"written_{md}"),
        ("... dropped, same idea twice", f"dropped_duplicate_{md}", None),
        ("... dropped, after the fifth", f"dropped_over_max_{md}", None),
        ("... runs where none were shown", f"none_shown_{md}", f"runs_{md}"),
        ("... words per shown suggestion", f"words_shown_{md}", f"shown_{md}"),
        ("... runs with an \"other variations\" line", f"variations_given_{md}", f"runs_{md}"),
    )
)
PER_CASE = (
    ("Written", "written", None),
    ("Shown", "shown", None),
    ("Dropped", "dropped", None),
)
AGREEMENT = ("Two runs agree when the clinician would be shown the same number of suggestions. "
             "Wording is ignored, so this says nothing about whether they are the same suggestions.")


NOT_COVERED = [
    "Whether a suggestion is good is not scored: a smaller version of the same situation, no safety "
    "behavior kept, no way out, no fear the child never raised. That needs the reviewers, which are "
    "a later item, and Dr. Walker's rubric.",
    "The difference between \"with\" and \"without\" is only in counts and length here. Whether "
    "knowing the feared outcome makes the suggestions better is the question the reviewers have to "
    "answer.",
    "No case has steps already on the ladder: the pool's families have behaviors, not rungs. The "
    "prompt's \"four comes easily\" when there are steps is not tested.",
    "The child's behaviors are given as what they do to cope. Parent accommodations are not given, "
    "because the app does not send them.",
    "\"Same idea twice\" means the same words once small words are left out. Two wordings of one "
    "idea (\"cafeteria\" and \"lunchroom\") are not caught.",
    "Every case is easier versions of a whole situation. Easier versions of one combination (the "
    "rung endpoint) use the same prompt with a different input and are not run.",
    "The answer keys' feared outcomes are the generating agents' own. No clinician has checked them.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]

