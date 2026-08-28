"""The arrow-probe checks themselves.

The evaluation runner needs an API key and costs money, so it is not part of this suite. The
CHECKS are pure and cheap, and if they are wrong the evaluation is worthless — so they get tested
here, in CI, against the three failure modes seen in real production data.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "AI-dev" / "Arrow Eval"))

import checks  # noqa: E402


def failed(probe, said):
    return [c["check"] for c in checks.run_all(probe, said) if not c["passed"]]


def test_a_good_probe_passes_everything():
    """Real output from production, 2026-08-24, after the prompt was rewritten."""
    assert failed(
        "What will happen if everybody laughs at you?",
        "I'll drop the ball and everybody will laugh at me.",
    ) == []


def test_catches_a_verbatim_echo():
    """The old client-side template pasted the child's sentence in, punctuation and all."""
    assert "not_a_verbatim_echo" in failed(
        "What will happen if... I mean, I'm gonna feel really awkward and I'm gonna not like that.?",
        "I mean, I'm gonna feel really awkward and I'm gonna not like that.",
    )


def test_catches_a_meaning_probe():
    """What the prompt asked for until 2026-08-24 — a different technique entirely."""
    assert "no_meaning_probe" in failed(
        "And if people did laugh at you, what would that mean about you?",
        "People will laugh at me.",
    )


def test_catches_a_question_that_drifts_off_what_the_child_said():
    assert "uses_their_words" in failed("And then what?", "I won't have any friends at school")


def test_catches_a_statement_and_a_speech():
    assert "is_a_question" in failed("Tell me more about that.", "I will feel like an idiot")
    assert "is_short" in failed(
        "What will happen if " + "you feel like an idiot and then " * 8 + "?",
        "I will feel like an idiot",
    )
