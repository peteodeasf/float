"""Deterministic checks on a downward-arrow probe.

No model, no judgement. Each returns (passed, reason).

The pair that matters is `uses_their_words` and `not_a_verbatim_echo`. Together they are what
"restating" means: the question has to be built from what the child just said, but not be a
copy-paste of it. Passing one and failing the other is the two ways this goes wrong —
  - all new words  -> the question drifted off what the child actually feared
  - a straight copy -> "What will happen if... I mean, I'm gonna feel really awkward and I'm gonna
    not like that.?" (a real example from the app's old client-side template)
"""
import re

# Phrasings from the meaning/core-belief technique. This chain is about consequences; these must
# never appear. The prompt was doing exactly this until 2026-08-24.
MEANING_PHRASES = [
    "mean about you", "mean about them", "say about you", "say about them",
    "what would that mean", "what does that mean about",
    "why would that be so bad", "what would be so bad",
]

STOPWORDS = {
    "a","an","and","are","as","at","be","but","by","do","for","from","get","go","had","has","have",
    "how","i","if","in","is","it","its","just","like","me","my","of","on","or","so","that","the",
    "their","them","then","there","they","this","to","up","was","what","when","will","with","you",
    "your","im","ill","id","dont","cant","wont","really","gonna","not","would","could","about",
}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z']+", (text or "").lower()) if w not in STOPWORDS and len(w) > 2}


def is_a_question(probe: str) -> tuple[bool, str]:
    p = (probe or "").strip()
    return (p.endswith("?"), "does not end with a question mark" if not p.endswith("?") else "")


def is_one_question(probe: str) -> tuple[bool, str]:
    n = (probe or "").count("?")
    return (n == 1, f"contains {n} question marks; should ask one thing" if n != 1 else "")


def is_short(probe: str, max_words: int = 30) -> tuple[bool, str]:
    n = len((probe or "").split())
    return (n <= max_words, f"{n} words; a child should not be read a paragraph" if n > max_words else "")


def no_meaning_probe(probe: str) -> tuple[bool, str]:
    low = (probe or "").lower()
    hit = next((p for p in MEANING_PHRASES if p in low), None)
    return (hit is None, f"asks what it MEANS ('{hit}') — this chain asks what HAPPENS" if hit else "")


def uses_their_words(probe: str, child_last_said: str) -> tuple[bool, str]:
    theirs, mine = _words(child_last_said), _words(probe)
    if not theirs:
        return (True, "")
    shared = theirs & mine
    return (bool(shared), "shares no meaningful word with what the child just said" if not shared else "")


def not_a_verbatim_echo(probe: str, child_last_said: str) -> tuple[bool, str]:
    """The child's sentence pasted into the template rather than restated."""
    said = (child_last_said or "").strip().rstrip(".!?").lower()
    if len(said.split()) < 4:
        return (True, "")   # too short for echoing to be meaningful
    if said in (probe or "").lower():
        return (False, "repeats the child's sentence verbatim instead of restating it")
    return (True, "")


def run_all(probe: str, child_last_said: str) -> list[dict]:
    checks = [
        ("is_a_question", is_a_question(probe)),
        ("is_one_question", is_one_question(probe)),
        ("is_short", is_short(probe)),
        ("no_meaning_probe", no_meaning_probe(probe)),
        ("uses_their_words", uses_their_words(probe, child_last_said)),
        ("not_a_verbatim_echo", not_a_verbatim_echo(probe, child_last_said)),
    ]
    return [{"check": n, "passed": p, "reason": r} for n, (p, r) in checks]
