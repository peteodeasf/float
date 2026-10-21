"""Tests for the suggested-rungs runner. A fake AI client stands in for the API, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests
"""
import json

import report
import rungs
from budget import Budget, MeteredClient
from cases import load_cases
from engine import run_cases
from test_runner import FakeClient, family

FAMILY = "fam-social-01"


def run(answer, runs=1, fid=FAMILY):
    cases = load_cases("rungs", [fid])
    b = Budget(10)
    client = FakeClient(answer if callable(answer) else (lambda kw: json.dumps(answer)))
    results, _ = run_cases(rungs, cases, MeteredClient(client, b), runs)
    return cases, results, b, client


# ── The cases ────────────────────────────────────────────────────────────────

def test_a_situation_with_a_feared_outcome_is_run_with_and_without_it():
    # The comparison the backlog asks for only means something if the same situation is run both
    # ways, so the "without" case must be the "with" case minus the feared outcome and nothing else.
    f = family()
    cases = load_cases("rungs", [FAMILY])
    by_id = {c.id: c for c in cases}
    for s in f["facts"]["situations"]:
        if any(r["situation_ref"] == s["id"] for r in f["judgment"]["rungs"]) and s.get("feared_outcome"):
            w = by_id[f"{FAMILY}/rungs/{s['id']}/with"]
            wo = by_id[f"{FAMILY}/rungs/{s['id']}/without"]
            assert w.input["feared_outcome"] == s["feared_outcome"]
            assert wo.input == {**w.input, "feared_outcome": ""}


def test_a_situation_with_no_feared_outcome_is_run_once():
    # Nothing to take away, so a "with" case would be the same as "without". One case, "none".
    for c in load_cases("rungs"):
        if c.expected["mode"] == "none":
            assert c.input["feared_outcome"] == ""
            assert not any(o.id == c.id.replace("/none", "/with") for o in load_cases("rungs", [c.family_id]))


def test_the_input_is_what_the_app_builds_and_is_metered():
    # The runner must test the app's prompt and input text, not a copy, and every call must go
    # through the spending meter.
    from app.services.step_suggestion_service import SUGGESTION_MODEL, SYSTEM_PROMPT, _context_block
    cases, _, b, client = run({"suggestions": ["A", "B"], "variations": ""})
    i = cases[0].input
    assert client.calls[0]["system"] == SYSTEM_PROMPT
    assert client.calls[0]["model"] == SUGGESTION_MODEL
    assert client.calls[0]["messages"][0]["content"] == _context_block(
        situation=i["situation"], score=i["score"], feared_outcome=i["feared_outcome"],
        steps=i["steps"], coping=i["coping"])
    assert b.calls == len(cases) and b.spent_usd > 0


# ── Scoring ──────────────────────────────────────────────────────────────────

def test_counts_follow_the_apps_limits():
    # The score counts what the clinician would see, which is what `within_limits` leaves. Eight
    # written, one repeated and one long (kept, there is no length limit): five shown, and each drop
    # counted under its reason.
    written = ["One", "one", " ".join(["word"] * 13), "Two", "Three", "Four", "Five", "Six"]
    _, results, _, _ = run({"suggestions": written, "variations": "where you sit"})
    run0 = results[0].runs[0]
    mode = results[0].case_id.rsplit("/", 1)[1]
    s = run0.score
    assert (s[f"written_{mode}"], s[f"shown_{mode}"]) == (8, 5)
    assert (s[f"dropped_duplicate_{mode}"], s[f"dropped_over_max_{mode}"]) == (1, 2)
    assert s[f"none_shown_{mode}"] == 0 and s[f"variations_given_{mode}"] == 1
    # The other modes stay at zero, so totals keep "with" and "without" apart.
    for other in set(rungs.MODES) - {mode}:
        assert s[f"runs_{other}"] == 0
    assert run0.checks["two_to_five"] and run0.checks["no_idea_twice"]


def test_one_suggestion_counts_as_none_shown():
    # Below the floor the app shows nothing, so the score must say nothing was shown, not one.
    _, results, _, _ = run({"suggestions": ["Imagine it"], "variations": ""})
    mode = results[0].case_id.rsplit("/", 1)[1]
    s = results[0].runs[0].score
    assert (s[f"shown_{mode}"], s[f"none_shown_{mode}"]) == (0, 1)


def test_clinical_words_fail_the_plain_language_check():
    # The child reads these. Ladder Eval's list of clinical words is run on every reply.
    _, results, _, _ = run({"suggestions": ["Do an exposure at lunch", "Imagine lunch"], "variations": ""})
    assert results[0].runs[0].checks["plain_enough_for_a_child"]


def test_an_unreadable_reply_is_a_failed_check_not_a_crash():
    _, results, _, _ = run(lambda kw: "not json")
    r = results[0].runs[0]
    assert r.score is None and r.checks == {"app_can_read": ["the app's reader could not read the reply"]}


def test_the_report_holds_no_suggestion_text():
    # The report goes in a pull request. A suggestion is written about a child, made up or not.
    _, results, b, _ = run({"suggestions": ["Sit by the secret window", "Imagine it"], "variations": "x"})
    rep = report.build(rungs, results, runs_per_case=1, cases_planned=len(results), budget=b, stopped=None)
    text = json.dumps(rep) + report.markdown(rep)
    assert "secret window" not in text
    assert rep["totals"]["runs_with"] + rep["totals"]["runs_without"] + rep["totals"]["runs_none"] == len(results)
