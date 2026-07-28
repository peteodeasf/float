"""
Tests for the accuracy layer (accuracy.py).

Two things proven here:
  1. On gold-vs-gold (stub), every case scores perfectly -- including the tricky
     cases where two situations share a name and rating (case 1 cafeteria 8/6,
     case 3 bedtime 7/7). If the situation matcher mis-aligned those, type
     accuracy would drop below 1.0 even though output == gold. So these tests also
     validate the ALIGNMENT, not just the scoring.
  2. Negative tests: a flipped type, a dropped situation, and an invented
     situation are each caught.

Run:  pytest test_accuracy.py -v
"""

import copy
import json
import os
import pytest

import accuracy
from extractor_adapter import extract

HERE = os.path.dirname(__file__)
CASES = json.load(open(os.path.join(HERE, "tests", "fixtures.json")))["cases"]
IDS = [f"case{c['case_id']}" for c in CASES]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_gold_vs_gold_scores_perfect(case):
    raw, out = extract(case["source_note"], expected=case)
    report = accuracy.score_case(out, case)
    assert report["situation_recall"] == 1.0, report
    assert report["type_accuracy"] == 1.0, report
    assert report["mismatches"] == []
    assert report["missed_situations"] == []
    assert report["spurious_situations"] == []


def _case(cid):
    return copy.deepcopy(next(c for c in CASES if c["case_id"] == cid))


def test_flipped_type_is_caught():
    gold = _case(1)
    out = copy.deepcopy(gold)
    # flip the cafeteria-8 behavior from avoidance -> safety
    out["situations"][0]["behaviors"][0]["type"] = "safety"
    report = accuracy.score_case(out, gold)
    assert report["type_accuracy"] < 1.0
    assert report["mismatches"], "type flip should surface as a mismatch"


def test_dropped_situation_is_caught():
    gold = _case(6)  # three situations
    out = copy.deepcopy(gold)
    out["situations"] = out["situations"][:-1]  # drop the last one
    report = accuracy.score_case(out, gold)
    assert report["missed_situations"], "a dropped situation should be reported"
    assert report["situation_recall"] < 1.0


def test_invented_situation_is_caught():
    gold = _case(7)  # one situation
    out = copy.deepcopy(gold)
    out["situations"].append({
        "name": "Made-up situation", "fear_rating": 5,
        "behaviors": [{"type": "avoidance", "description": "invented"}],
    })
    report = accuracy.score_case(out, gold)
    assert report["spurious_situations"], "an invented situation should be reported"


def test_same_name_same_rating_disambiguates():
    # case 3: two "Bedtime, 7/10" situations, distinguished only by behavior type.
    gold = _case(3)
    out = copy.deepcopy(gold)
    # reverse the order the extractor returns them
    out["situations"] = list(reversed(out["situations"]))
    report = accuracy.score_case(out, gold)
    # must still match correctly despite identical name+rating and reversed order
    assert report["type_accuracy"] == 1.0, report
    assert report["mismatches"] == []
