"""Mechanical checks on suggested smaller versions of a situation.

Settled with Peter, 2026-08-28:

  - The feature proposes smaller situations. It does not propose distress ratings, and is not asked
    to: in session mode the child is in the room and the rating is their answer. There is no check
    for the absence of ratings, because there is no field for one — a check against a feature we
    did not build is noise.
  - Suggestions are pulled up by the clinician from the situation, not pushed at them.
  - THE CHILD READS THEM. That is why plain language is a blocking check here and would not be if
    only a clinician saw them.

What these settle is form. Whether a suggestion is a genuinely smaller version of the same
situation, whether it varies something real, and whether it puts a fear in front of the child that
they never raised — none of that is mechanical. It needs a scorer, and the scorer's rubric needs
Dr. Walker.

Two checks were written and REMOVED after drafting answers by hand and watching them fail on
answers that were right:

  - `stays_in_the_situation` (shares a word with the situation name) rejected "Say hi to one person
    you already know" for the situation "Talk to someone". Correct answer, no shared word.
  - `introduces_nothing_new` (no words beyond the situation and its rungs) fired on every correct
    suggestion, because narrowing a situation IS adding specifics — "for ten minutes", "with one
    friend". There is no word-level version of the safety check for this feature.

Both are the scorer's job. Leaving them in would have taught us to write worse suggestions.

Plan: docs/plans/ladder-generation.md
"""
import re

# Two, not three. Peter reviewed drafts where a situation with nothing on its ladder got only two
# suggestions I would stand behind, and judged them fine. A minimum of three would push the model
# to invent a context to fill the slot — which is the one failure this feature cannot afford, and
# the one no mechanical check catches. Fewer suggestions is the correct answer to a thin situation.
MIN_SUGGESTIONS = 2
MAX_SUGGESTIONS = 5
# A child reads these aloud in session. Long ones stop being a thing you can say yes or no to.
MAX_WORDS_PER_SUGGESTION = 18
# Two suggestions sharing this much of their wording are probably one idea written twice.
DUPLICATE_OVERLAP = 0.85

# Words that belong in a clinician's notes, not in front of a child. The list is deliberately short
# and literal; it grows when something gets through, not by guessing in advance.
CLINICAL_WORDS = {
    "somatic", "avoidance", "avoidant", "safety behavior", "safety behaviour", "exposure",
    "hierarchy", "distress thermometer", "anticipatory", "comorbid", "presentation",
    "dysregulation", "escalates", "ritual", "compulsion", "accommodation", "maladaptive",
    "affect", "symptomology", "ideation", "reinforcement", "habituation",
}

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "if", "in", "into",
    "is", "it", "my", "of", "on", "or", "so", "than", "that", "the", "their", "them", "then",
    "there", "they", "this", "to", "up", "was", "with", "you", "your", "just", "would", "one",
}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z']+", (text or "").lower())
            if w not in STOPWORDS and len(w) > 2}


def _names(suggestions) -> list[str]:
    return [str(s.get("name", "")).strip() if isinstance(s, dict) else str(s).strip()
            for s in (suggestions or [])]


def has_the_right_shape(suggestions) -> tuple[bool, str]:
    if not isinstance(suggestions, list):
        return (False, "not a list")
    empty = [i for i, n in enumerate(_names(suggestions)) if not n]
    return (not empty, f"suggestions {empty} have no text" if empty else "")


def right_number_of_suggestions(suggestions) -> tuple[bool, str]:
    n = len(suggestions or [])
    ok = MIN_SUGGESTIONS <= n <= MAX_SUGGESTIONS
    return (ok, f"{n} suggestions; wanted {MIN_SUGGESTIONS}-{MAX_SUGGESTIONS}" if not ok else "")


def plain_enough_for_a_child(suggestions) -> tuple[bool, str]:
    """The child reads these. Clinical vocabulary in front of an anxious child is its own harm."""
    hits = []
    for name in _names(suggestions):
        low = name.lower()
        found = [w for w in CLINICAL_WORDS if w in low]
        if found:
            hits.append(f"{name!r} contains {found}")
    return (not hits, "; ".join(hits) if hits else "")


def short_enough_to_say(suggestions) -> tuple[bool, str]:
    long_ones = [f"{n!r} ({len(n.split())} words)" for n in _names(suggestions)
                 if len(n.split()) > MAX_WORDS_PER_SUGGESTION]
    return (not long_ones,
            f"longer than {MAX_WORDS_PER_SUGGESTION} words: " + "; ".join(long_ones)
            if long_ones else "")


def no_duplicates(suggestions) -> tuple[bool, str]:
    """One idea written twice. A warning, not a failure — two suggestions can differ by a single
    word that matters ("with the fan" / "without the fan") and still be genuinely different."""
    names = _names(suggestions)
    pairs = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = _words(names[i]), _words(names[j])
            if not a or not b:
                continue
            if len(a & b) / min(len(a), len(b)) >= DUPLICATE_OVERLAP:
                pairs.append(f"{names[i]!r} / {names[j]!r}")
    return (not pairs, "possibly the same idea twice: " + "; ".join(pairs) if pairs else "")


def not_already_a_rung(suggestions, existing_rungs) -> tuple[bool, str]:
    """Suggesting something already on the ladder wastes the clinician's attention. A warning,
    because near-matches are sometimes a deliberate variation."""
    existing = [_words(str(r.get("name", ""))) for r in (existing_rungs or [])]
    repeats = []
    for name in _names(suggestions):
        mine = _words(name)
        if not mine:
            continue
        for other in existing:
            if other and len(mine & other) / min(len(mine), len(other)) >= DUPLICATE_OVERLAP:
                repeats.append(name)
                break
    return (not repeats, f"already on the ladder: {repeats}" if repeats else "")


def run_all(suggestions, existing_rungs: list[dict] | None = None) -> list[dict]:
    results = [
        ("has_the_right_shape", has_the_right_shape(suggestions), True),
        ("right_number_of_suggestions", right_number_of_suggestions(suggestions), True),
        ("plain_enough_for_a_child", plain_enough_for_a_child(suggestions), True),
        ("short_enough_to_say", short_enough_to_say(suggestions), True),
        ("no_duplicates", no_duplicates(suggestions), False),
        ("not_already_a_rung", not_already_a_rung(suggestions, existing_rungs), False),
    ]
    return [{"check": name, "passed": passed, "reason": reason, "blocking": blocking}
            for name, (passed, reason), blocking in results]
