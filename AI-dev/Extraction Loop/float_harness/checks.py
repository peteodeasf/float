"""
Deterministic checks for the Float monitoring-extraction loop.

These are plain pass/fail code checks -- no model, no judgment. Each function
takes the extractor's output (and the source note where needed) and returns a
list of human-readable failure strings. Empty list == passed.

The four checks:
  1. check_behavior_enum      -- every behavior type is one of the allowed labels
  2. check_rating_integrity   -- no fear_rating that doesn't appear in the source note
  3. check_no_duplicate_situations -- the same occurrence isn't emitted twice
  4. check_clean_json         -- raw extractor text parses as JSON with no markdown fences

These bind to the FIXTURE output shape (the target the extractor must conform to),
not to the existing auto-generated extractor.
"""

import json
import re

ALLOWED_TYPES = {"avoidance", "safety", "escape", "unclear"}


def _numbers(text):
    """All integers appearing in a string, as a set."""
    return set(int(n) for n in re.findall(r"\d+", text or ""))


def _normalize(name):
    """Loose normalization for comparing situation names (fuzzy-merge key)."""
    return re.sub(r"\s+", " ", (name or "").strip().lower())


# ---------------------------------------------------------------- check 1
def check_behavior_enum(output):
    """Every behavior.type must be in ALLOWED_TYPES."""
    fails = []
    for s in output.get("situations", []):
        for b in s.get("behaviors", []):
            t = b.get("type")
            if t not in ALLOWED_TYPES:
                fails.append(
                    f"behavior {b.get('behavior_id', '?')} has type {t!r}, "
                    f"not in {sorted(ALLOWED_TYPES)}"
                )
    return fails


# ---------------------------------------------------------------- check 2
def check_rating_integrity(output, source_note):
    """
    No invented ratings: any fear_rating / fear_rating_max in the output must
    appear as a number in the source note. (The 'null when the parent gave no
    number' direction needs a no-rating fixture to exercise -- see TODO in tests.)
    """
    fails = []
    source_nums = _numbers(source_note)
    for s in output.get("situations", []):
        for key in ("fear_rating", "fear_rating_max"):
            if key in s and s[key] is not None:
                if s[key] not in source_nums:
                    fails.append(
                        f"situation {s.get('name')!r} has {key}={s[key]} "
                        f"which does not appear in the source note"
                    )
    return fails


# ---------------------------------------------------------------- check 3
def check_no_duplicate_situations(output):
    """
    No two emitted situations are fully identical after normalizing the name.
    A recurring situation at a different fear or with different behaviors is NOT
    a duplicate (e.g. cafeteria at 8 then at 6); an exact repeat is.
    """
    fails = []
    seen = {}
    for s in output.get("situations", []):
        behaviors = tuple(sorted(
            (b.get("type"), (b.get("description") or "").strip().lower())
            for b in s.get("behaviors", [])
        ))
        key = (_normalize(s.get("name")), s.get("fear_rating"), behaviors)
        if key in seen:
            fails.append(
                f"duplicate situation: {s.get('name')!r} "
                f"(fear {s.get('fear_rating')}) emitted more than once"
            )
        seen[key] = True
    return fails


# ---------------------------------------------------------------- check 4
def check_clean_json(raw_text):
    """
    The extractor's raw text output must parse as JSON and carry no markdown
    code fences. Returns (parsed_or_None, fails).
    """
    fails = []
    if "```" in raw_text:
        fails.append("output contains markdown code fences (```)")
    parsed = None
    try:
        parsed = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError) as e:
        fails.append(f"output is not valid JSON: {e}")
    return parsed, fails


def run_all(output, source_note):
    """Convenience: run the output-vs-source checks, return {check: fails}."""
    return {
        "behavior_enum": check_behavior_enum(output),
        "rating_integrity": check_rating_integrity(output, source_note),
        "no_duplicate_situations": check_no_duplicate_situations(output),
    }
