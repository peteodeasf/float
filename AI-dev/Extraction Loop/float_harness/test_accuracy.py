"""
Tests for the accuracy layer (accuracy.py).

Two things proven here:
  1. On gold-vs-gold, every case scores perfectly. Situations sharing a name
     (case 1 cafeteria 8/6, case 3 bedtime 7/7) are merged before comparing, the
     way the app returns them.
  2. Negative tests: a flipped type, a dropped situation, and an invented
     situation are each caught.

Run:  pytest test_accuracy.py -v
"""

import copy
import json
import os
import pytest

import accuracy

HERE = os.path.dirname(__file__)
CASES = json.load(open(os.path.join(HERE, "tests", "fixtures.json")))["cases"]
IDS = [f"case{c['case_id']}" for c in CASES]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_gold_vs_gold_scores_perfect(case):
    report = accuracy.score_case(copy.deepcopy(case), case)
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


def test_recurring_situation_returned_once_is_not_missed():
    # case 1: the fixture has "Lunchtime at school" twice (8/10, then 6/10). The app returns it
    # once, with both entries' behaviors and one of the ratings.
    gold = _case(1)
    once = copy.deepcopy(gold["situations"][0])
    once["behaviors"] += copy.deepcopy(gold["situations"][1]["behaviors"])
    once["fear_rating"] = 6
    report = accuracy.score_case({"situations": [once]}, gold)
    assert report["missed_situations"] == []
    assert report["type_accuracy"] == 1.0, report


def test_merged_situation_with_a_wrong_type_is_caught():
    gold = _case(3)
    once = copy.deepcopy(gold["situations"][0])
    once["behaviors"] += [dict(b, type="escape") for b in gold["situations"][1]["behaviors"]]
    report = accuracy.score_case({"situations": [once]}, gold)
    assert report["type_accuracy"] < 1.0
    assert report["mismatches"]
