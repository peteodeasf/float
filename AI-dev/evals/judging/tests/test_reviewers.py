"""Tests for the reviewing agents. A fake AI client stands in for the API, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/judging/tests
"""
import csv
import json
import re
from types import SimpleNamespace

import pytest

import check_rung_reviewer as crr
import reviewers as rv
from budget import Budget, MeteredClient


class FakeClient:
    """Answers every call with `respond(kwargs)`, and keeps the calls."""

    def __init__(self, respond, stop_reason="end_turn"):
        self._respond = respond
        self._stop = stop_reason
        self.messages = self
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="thinking", thinking=""),
                     SimpleNamespace(type="text", text=self._respond(kwargs))],
            stop_reason=self._stop,
            usage=SimpleNamespace(input_tokens=1500, output_tokens=600))


def answer(*items):
    return json.dumps({"items": [
        {"n": n, "verdict": verdict, "objections": [{"rule": r, "reason": "because"} for r in rules]}
        for n, (verdict, rules) in enumerate(items, 1)]})


SAFETY = rv.load("child_safety", "rungs")


# --- An objection must name its rule ------------------------------------------------------------

def test_dont_show_with_a_named_rule_counts():
    # Why: the basic case. A rule the reviewer was given, named on a dont_show, is a broken rule.
    [v] = rv.judge(SAFETY, answer(("dont_show", ["no-way-out"])), 1)
    assert v.verdict == rv.DONT_SHOW
    assert [r for r, _ in v.broken] == ["no-way-out"]
    assert not v.opinion_only


def test_dont_show_with_no_rule_is_an_opinion_and_counts_as_show():
    # Why: the plan's rule. An objection with no rule is the reviewer's own opinion. It must not
    # stop a suggestion being shown, or the reviewer could mark by taste and call it Dr. Walker's.
    [v] = rv.judge(SAFETY, answer(("dont_show", ["none"])), 1)
    assert v.verdict == rv.SHOW
    assert v.opinion_only
    assert v.opinions == [("none", "because")]


def test_a_rule_the_reviewer_does_not_have_is_an_opinion():
    # Why: a reviewer that makes up a rule id, or borrows another reviewer's, has not named one of
    # its own rules. "fits-the-age" belongs to the age reviewer, not the safety one.
    [v] = rv.judge(SAFETY, answer(("dont_show", ["fits-the-age", "rule-7"])), 1)
    assert v.verdict == rv.SHOW and v.opinion_only
    assert [r for r, _ in v.opinions] == ["fits-the-age", "rule-7"]


def test_an_objection_with_the_rule_left_out_is_an_opinion():
    # Why: a missing or empty "rule" field must not slip through as a broken rule.
    raw = json.dumps({"items": [{"n": 1, "verdict": "dont_show",
                                 "objections": [{"reason": "x"}, {"rule": "", "reason": "y"}]}]})
    [v] = rv.judge(SAFETY, raw, 1)
    assert v.verdict == rv.SHOW and len(v.opinions) == 2


def test_show_with_a_named_rule_counts_as_dont_show():
    # Why: the reviewer contradicted itself. The broken rule it named is the part that can be
    # checked, so it wins, and the contradiction is counted.
    [v] = rv.judge(SAFETY, answer(("show", ["no-new-fear"])), 1)
    assert v.verdict == rv.DONT_SHOW
    assert v.show_with_broken_rule


def test_rule_ids_match_whatever_the_case():
    # Why: "No-Way-Out" is the same rule; a capital letter must not turn it into an opinion.
    [v] = rv.judge(SAFETY, answer(("dont_show", ["No-Way-Out"])), 1)
    assert v.verdict == rv.DONT_SHOW


def test_a_skipped_item_is_unanswered_not_shown():
    # Why: if the reviewer answers 2 of 3, the third must count as no verdict. Treating it as
    # "show" would raise agreement on the suggestions she wanted shown for no reason.
    vs = rv.judge(SAFETY, answer(("show", []), ("show", [])), 3)
    assert [v.verdict for v in vs] == [rv.SHOW, rv.SHOW, None]


def test_items_out_of_range_are_ignored():
    raw = json.dumps({"items": [{"n": 5, "verdict": "dont_show",
                                 "objections": [{"rule": "no-way-out"}]}]})
    assert [v.verdict for v in rv.judge(SAFETY, raw, 2)] == [None, None]


@pytest.mark.parametrize("raw", ["not json", "[]", '{"items": "x"}', '{"verdicts": []}'])
def test_an_unreadable_reply_is_none(raw):
    # Why: a reply that is not the asked-for JSON gives no verdicts at all, not a row of shows.
    assert rv.judge(SAFETY, raw, 2) is None


def test_a_fenced_reply_is_read():
    assert rv.judge(SAFETY, "```json\n" + answer(("show", [])) + "\n```", 1)[0].verdict == rv.SHOW


# --- The reviewers themselves -------------------------------------------------------------------

def test_each_reviewer_has_its_rules_and_frame():
    # Why: a concern file whose rules fail to parse would leave the reviewer with no rules, and
    # every objection would quietly become an opinion.
    expected = {
        "her_rules": ("no-way-out", "vary-the-situation", "symptom-not-target"),
        "child_safety": ("no-way-out", "no-new-fear", "nothing-invented"),
        "age": ("plain-words", "fits-the-age", "american-spelling"),
    }
    for feature in rv.FEATURES:
        for r in rv.load_all(feature):
            assert r.rules == expected[r.concern]
            assert "{" + "rules}" not in r.system and "{" + "what}" not in r.system
            for rule in r.rules:
                assert f"## {rule}" in r.system
            assert rv.WHAT[feature] in r.system


def test_reviewers_run_on_a_different_model_from_the_feature():
    # Why: the plan requires it, so the feature's habits are not marked by the same habits. The
    # feature's model is read from the app, so a change there is caught here.
    rv.check_models()
    for feature in rv.FEATURES:
        assert rv.REVIEWER_MODEL[feature] != rv.feature_model(feature)


def test_check_models_fails_when_they_match(monkeypatch):
    monkeypatch.setitem(rv.REVIEWER_MODEL, "rungs", rv.feature_model("rungs"))
    with pytest.raises(ValueError):
        rv.check_models()


def test_step_sentence_verdicts_are_marked_unchecked():
    # Why: Dr. Walker has marked no step sentences, so every step-sentence verdict must say it has
    # not been checked against her.
    client = FakeClient(lambda kw: answer(("show", [])))
    item = rv.step_item("Eating in front of others", "Sits facing the wall", "Eat facing the room")
    for r in rv.load_all("step_sentences"):
        assert rv.review(r, client, item).checked is False
    assert all(r.checked for r in rv.load_all("rungs"))


def test_review_sends_the_reviewer_model_and_no_temperature():
    client = FakeClient(lambda kw: answer(("show", []), ("dont_show", ["nothing-invented"])))
    item = rv.rung_item("Going to the mall", ["Walk past the mall", "Go with your aunt Linda"])
    result = rv.review(SAFETY, client, item)
    [call] = client.calls
    assert call["model"] == "claude-opus-5-5"
    assert "temperature" not in call
    assert call["system"] == SAFETY.system
    assert "1. Walk past the mall" in call["messages"][0]["content"]
    assert [v.verdict for v in result.verdicts] == [rv.SHOW, rv.DONT_SHOW]


def test_a_refusal_is_an_error_not_a_verdict():
    client = FakeClient(lambda kw: "", stop_reason="refusal")
    result = rv.review(SAFETY, client, rv.rung_item("x", ["a"]))
    assert result.verdicts is None and result.error == "refusal"


def test_a_reviewer_is_not_given_the_other_feature():
    with pytest.raises(ValueError):
        rv.review(SAFETY, FakeClient(lambda kw: ""), rv.step_item("a", "b", "c"))


def test_combined_is_dont_show_if_any_reviewer_found_a_broken_rule():
    def rev(*verdicts):
        return rv.Review("x", "rungs", True, [rv.Verdict(v, [("r", "")] if v == rv.DONT_SHOW else [])
                                              for v in verdicts])
    assert rv.combined([rev("show"), rev("dont_show")], 0) == rv.DONT_SHOW
    assert rv.combined([rev("show"), rev("show")], 0) == rv.SHOW
    assert rv.combined([rev("show"), rv.Review("x", "rungs", True, None, "unreadable")], 0) is None


def test_engine_hook_gives_a_dict_without_reasons():
    client = FakeClient(lambda kw: answer(("dont_show", ["no-way-out"])))
    hook = rv.engine_hook(SAFETY, client, lambda case, prepared, parsed: rv.rung_item("s", ["a"]))
    out = hook(None, None, {})
    assert out["verdicts"] == [{"verdict": rv.DONT_SHOW, "opinion_only": False,
                                "broken": ["no-way-out"], "opinions": 0}]


# --- The check against Dr. Walker's 60 ----------------------------------------------------------

def test_the_60_suggestions_she_reviewed():
    # Why: the plan measures the reviewer on the 60 she marked. If the files change and the count
    # moves, the agreement figures stop meaning what the report says they mean.
    sits = crr.situations()
    assert sum(len(s["item"]["items"]) for s in sits) == 60
    assert len(sits) == 16


def write_marks(tmp_path, rows):
    path = tmp_path / "marks.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["item_key", "choice", "suggestion"])
        w.writeheader()
        w.writerows(rows)
    return path


def test_marks_that_do_not_line_up_are_dropped(tmp_path):
    # Why: her marks are saved by position. If the review round's order differs from the files, a
    # mark would be compared with the wrong suggestion. The suggestion text catches that.
    sits = crr.situations()
    first = sits[0]
    path = write_marks(tmp_path, [
        {"item_key": f"{first['id']}:0", "choice": "show", "suggestion": first["item"]["items"][0]},
        {"item_key": f"{first['id']}:1", "choice": "hide", "suggestion": "some other text"},
        {"item_key": "sit-nope:0", "choice": "show", "suggestion": ""},
        {"item_key": f"{first['id']}:2", "choice": "maybe", "suggestion": ""},
        {"item_key": f"{first['id']}:3", "choice": "hide", "suggestion": ""},
    ])
    marks, problems = crr.load_marks(path, sits)
    assert marks == {f"{first['id']}:0": rv.SHOW, f"{first['id']}:3": rv.DONT_SHOW}
    assert len(problems) == 3


def test_agreement_counts_and_says_its_total():
    per_key = {"a:0": [rv.SHOW, rv.DONT_SHOW, None], "a:1": [rv.DONT_SHOW], "a:2": [rv.SHOW]}
    marks = {"a:0": rv.SHOW, "a:1": rv.DONT_SHOW}
    a = crr.agreement(per_key, marks)
    assert a["agreed"] == 2 and a["out_of"] == 3 and a["no_verdict"] == 1
    assert a["she_show__reviewer_dont_show"] == 1


def test_a_whole_run_with_marks_and_a_spending_stop(tmp_path):
    # Why: end to end with a fake client. The spending limit must stop the run part-way, keep what
    # was done, and the report must say so and still add up.
    sits = crr.situations()[:2]

    def respond(kw):
        n = len(re.findall(r"^\d+\. ", kw["messages"][0]["content"], re.M))
        return answer(*[("dont_show", ["no-way-out"])] * n)

    # Each fake call costs $0.018, so $0.20 allows ten of the twelve calls.
    budget = Budget(0.20)
    client = MeteredClient(FakeClient(respond), budget)
    results, stopped = crr.run(sits, rv.load_all("rungs"), client, runs=2)
    assert stopped and "spending limit" in stopped
    marks = {f"{sits[0]['id']}:0": rv.DONT_SHOW, f"{sits[0]['id']}:1": rv.SHOW}
    rep = crr.build(results, sits, 2, marks, budget, stopped)
    safety = rep["reviewers"]["child_safety"]
    assert safety["dont_show"] + safety["show"] + safety["no_verdict"] == safety["verdicts"]
    assert safety["rules_named"] == {"no-way-out": safety["dont_show"]}
    assert rep["reviewers"]["all"]["agreement"]["out_of"] > 0
    md = crr.markdown(rep)
    assert "Stopped early" in md and "Agrees with her on" in md and "Not covered" in md


def test_main_without_a_key_runs_nothing(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert crr.main(["--out", str(tmp_path)], make_client=lambda: pytest.fail("called")) == 2
