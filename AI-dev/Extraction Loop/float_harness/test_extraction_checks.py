"""
Pytest harness for the Float monitoring-extraction loop. No API calls.

  * The fixtures are the right answers, so each one must pass the deterministic checks.
    A fixture that fails a check means the fixture or the check is wrong.
  * Every note must turn into one monitoring entry per "(Situation, fear N/10)", which is
    how extractor.py feeds cases to the app's prompt.
  * NEGATIVE tests feed deliberately broken output to each check to prove the
    check actually catches the failure -- so a green suite means something.

Scoring the app's real extraction is loop_driver.py, not pytest.

Run:  pytest -v
"""

import json
import os
import pytest

import checks
from extractor import entries_from_note

HERE = os.path.dirname(__file__)
FIXTURES = json.load(open(os.path.join(HERE, "tests", "fixtures.json")))
CASES = FIXTURES["cases"]
IDS = [f"case{c['case_id']}-{c['title'].replace(' ', '_')}" for c in CASES]


# ============================================================ the fixtures themselves
@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_behavior_enum(case):
    fails = checks.check_behavior_enum(case)
    assert not fails, fails


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_rating_integrity(case):
    fails = checks.check_rating_integrity(case, case["source_note"])
    assert not fails, fails


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_no_duplicate_situations(case):
    fails = checks.check_no_duplicate_situations(case)
    assert not fails, fails


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_note_becomes_one_entry_per_occurrence(case):
    entries = entries_from_note(case["source_note"])
    assert len(entries) == len(case["situations"])
    assert all(e.situation and e.parent_response for e in entries)


def test_every_case_is_in_one_half():
    assert {c["split"] for c in CASES} == {"tune", "holdout"}


# ============================================================ no-rating path
# Cases where the parent gave no fear rating at all: the extractor must not
# invent one. (check_rating_integrity also catches this, since an invented number
# won't appear in the source -- this makes the intent explicit.)
NO_RATING = [c for c in CASES if all(s.get("fear_rating") is None for s in c["situations"])]


@pytest.mark.parametrize("case", NO_RATING, ids=[f"case{c['case_id']}" for c in NO_RATING])
def test_no_invented_rating_when_none_given(case):
    invented = [s["name"] for s in case["situations"] if s.get("fear_rating") is not None]
    assert not invented, f"extractor invented a rating for: {invented}"


# ============================================================ negative tests
# Prove each check is not vacuous: hand it broken output, expect it to complain.

def test_enum_catches_bad_label():
    bad = {"situations": [{"name": "x", "fear_rating": 5,
            "behaviors": [{"behavior_id": "b1", "type": "withdrawal", "description": "d"}]}]}
    assert checks.check_behavior_enum(bad)  # 'withdrawal' is not allowed


def test_rating_integrity_catches_invented_rating():
    out = {"situations": [{"name": "Cafeteria", "fear_rating": 7, "behaviors": []}]}
    note = "She ate in the library again. No number given by the parent."
    assert checks.check_rating_integrity(out, note)  # 7 isn't in the note


def test_rating_integrity_passes_when_rating_in_source():
    out = {"situations": [{"name": "Cafeteria", "fear_rating": 8, "behaviors": []}]}
    note = "(Lunchtime, fear 8/10) She ate in the library."
    assert not checks.check_rating_integrity(out, note)


def test_dedup_catches_exact_repeat():
    s = {"name": "Bedtime", "fear_rating": 7,
         "behaviors": [{"type": "avoidance", "description": "refuses own room"}]}
    out = {"situations": [s, dict(s)]}
    assert checks.check_no_duplicate_situations(out)


def test_dedup_allows_same_name_different_fear():
    out = {"situations": [
        {"name": "Lunchtime", "fear_rating": 8, "behaviors": [{"type": "avoidance", "description": "library"}]},
        {"name": "Lunchtime", "fear_rating": 6, "behaviors": [{"type": "safety", "description": "headphones"}]},
    ]}
    assert not checks.check_no_duplicate_situations(out)  # different occurrences, not dups
