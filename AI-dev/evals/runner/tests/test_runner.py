"""Tests for the AI test runner. A fake AI client stands in for the API, so nothing is spent.

Run from anywhere:
    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests
"""
import json
from types import SimpleNamespace

import pytest

import monitoring_analysis as ma
import report
from budget import Budget, BudgetExceeded, MeteredClient
from cases import POOL, load_cases
from engine import run_cases, stability

FAMILY = "fam-social-01"


class FakeClient:
    """Answers every call with `respond(kwargs)`, and keeps each call's arguments."""

    def __init__(self, respond, tokens_in=2000, tokens_out=500):
        self.calls = []
        self._respond = respond
        self._usage = SimpleNamespace(input_tokens=tokens_in, output_tokens=tokens_out)
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text=self._respond(kwargs))], usage=self._usage)


def family(fid=FAMILY):
    return json.loads((POOL / f"{fid}.json").read_text())


def perfect_answer(fid=FAMILY, **change):
    """The reply a perfect extractor would give, built from the family's facts."""
    f = family(fid)
    log = f["inputs"]["monitoring_log"]
    sits = []
    for s in f["facts"]["situations"]:
        entries = [i for i, e in enumerate(log, 1) if e["situation_ref"] == s["id"]]
        if not entries:
            continue
        sits.append({
            "name": s["name"],
            "fear_rating": None,
            "behaviors": [{"order": n, "type": change.get(b["id"], b["type"]), "description": b["text"]}
                          for n, b in enumerate(s["behaviors"], 1)],
            "accommodations": [{"description": a["text"]} for a in s["accommodations"]],
            "entries": entries,
        })
    return {"situations": sits}


def run_one(answer, runs=1, budget=10.0, reviewers=()):
    cases = load_cases("monitoring_analysis", [FAMILY])
    b = Budget(budget)
    client = FakeClient(answer if callable(answer) else (lambda kw: json.dumps(answer)))
    results, stopped = run_cases(ma, cases, MeteredClient(client, b), runs, reviewers)
    return results, stopped, b, client


# ── The case loader ──────────────────────────────────────────────────────────

def test_case_input_hides_the_answer_key():
    # Float must never see which situation an entry is about, or the score means nothing.
    case = load_cases("monitoring_analysis", [FAMILY])[0]
    assert case.id == f"{FAMILY}/monitoring_analysis"
    assert all("situation_ref" not in e for e in case.input["monitoring_log"])
    assert case.expected["entry_refs"] == [e["situation_ref"] for e in family()["inputs"]["monitoring_log"]]


def test_risk_label_is_not_in_the_answer_key():
    # Peter, 2026-10-19: the risk flag is not scored until Dr. Walker says what a risk sign is.
    # Keeping it out of `expected` means no score can be built on it by accident.
    case = load_cases("monitoring_analysis", ["fam-school-04"])[0]
    assert "risk" not in json.dumps(case.expected)


def test_loader_picks_and_limits():
    # A mistyped family id must fail, not silently shrink the sample.
    assert len(load_cases("monitoring_analysis", limit=5)) == 5
    assert len(load_cases("monitoring_analysis")) == len(list(POOL.glob("*.json")))
    with pytest.raises(ValueError):
        load_cases("monitoring_analysis", ["fam-nope-99"])
    with pytest.raises(ValueError):
        load_cases("no_such_feature")


# ── It runs the app's code, not a copy ───────────────────────────────────────

def test_calls_use_the_apps_prompt_model_and_input():
    # The old 0.926 came from a copy of the prompt. This proves the call is the app's own.
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT
    from app.services.insight_service import EXTRACTION_MODEL

    _, _, _, client = run_one(perfect_answer())
    kw = client.calls[0]
    assert kw["system"] is EXTRACTION_SYSTEM_PROMPT
    assert kw["model"] == EXTRACTION_MODEL
    text = kw["messages"][0]["content"]
    assert text.startswith("[1] Date: 2026-09-28")
    assert "s1" not in text.split()  # no situation_ref leaked into what the model reads


# ── The N-runs loop ──────────────────────────────────────────────────────────

def test_each_case_runs_n_times():
    cases = load_cases("monitoring_analysis", limit=2)
    client = FakeClient(lambda kw: '{"situations": []}')
    results, stopped = run_cases(ma, cases, MeteredClient(client, Budget(10)), runs=3)
    assert stopped is None
    assert [len(r.runs) for r in results] == [3, 3]
    assert len(client.calls) == 6


def test_a_failed_call_is_recorded_and_the_run_goes_on():
    # One API error should not lose the rest of the night's runs.
    calls = {"n": 0}

    def flaky(kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("network")
        return json.dumps(perfect_answer())

    results, stopped, _, _ = run_one(flaky, runs=3)
    assert stopped is None
    assert [r.error for r in results[0].runs] == ["ConnectionError", None, None]
    # The failed call is left out of the stability figure: the two answers agree, so 1.0, not 0.67.
    assert results[0].stability == 1.0


# ── Scoring ──────────────────────────────────────────────────────────────────

def test_perfect_answer_scores_full_marks():
    results, _, _, _ = run_one(perfect_answer())
    run = results[0].runs[0]
    assert not any(run.checks.values()), run.checks
    s = run.score
    assert s["situations_found"] == s["situations"] > 0
    assert s["types_right"] == s["behaviors"] > 0
    assert (s["extra_behaviors"], s["unlinked"], s["split"]) == (0, 0, 0)


def test_wrong_type_and_unlinked_situation_are_counted():
    answer = perfect_answer(b2="safety")  # b2 is avoidance in the facts
    answer["situations"].append({"name": "Something never logged", "fear_rating": None,
                                 "behaviors": [], "accommodations": [], "entries": [99]})
    s = run_one(answer)[0][0].runs[0].score
    assert s["types_right"] == s["behaviors"] - 1
    assert s["extra_behaviors"] == 1
    assert s["unlinked"] == 1


def test_same_name_twice_is_one_situation():
    # rebuild_from_monitoring saves one row per normalised name, so the score must too.
    answer = perfect_answer()
    first = answer["situations"][0]
    answer["situations"].append({**first, "name": first["name"].upper() + "  ", "behaviors": []})
    s = run_one(answer)[0][0].runs[0].score
    assert s["split"] == 0 and s["unlinked"] == 0


def test_unreadable_reply_fails_the_check_and_is_not_scored():
    run = run_one(lambda kw: "I'm not sure what to make of this.")[0][0].runs[0]
    assert run.checks["app_can_read"]
    assert run.score is None


def test_invented_rating_fails_the_rating_check():
    answer = perfect_answer()
    answer["situations"][0]["fear_rating"] = 77
    run = run_one(answer)[0][0].runs[0]
    assert run.checks["rating_integrity"]


# ── Code checks first, then reviewers ────────────────────────────────────────

def test_reviewers_run_after_checks_and_only_on_readable_replies():
    # The hook for the reviewing agents (a later item). A reviewer must never see a reply the app
    # could not read, and must run after the code checks have been recorded.
    seen = []

    def reviewer(case, prepared, parsed):
        seen.append(parsed)
        return {"reviewer": "fake", "verdict": "ok"}

    replies = iter([json.dumps(perfect_answer()), "not json"])
    results, _, _, _ = run_one(lambda kw: next(replies), runs=2, reviewers=[reviewer])
    good, bad = results[0].runs
    assert good.reviews == [{"reviewer": "fake", "verdict": "ok"}]
    assert bad.reviews == []
    assert len(seen) == 1 and seen[0] == perfect_answer()


# ── The stability figure ─────────────────────────────────────────────────────

def test_stability_figure():
    assert stability(["a", "a", "a"]) == 1.0
    assert stability(["a", "b", "a"]) == pytest.approx(2 / 3)
    assert stability(["a", "b", "c"]) == pytest.approx(1 / 3)
    assert stability([]) is None


def test_runs_that_differ_only_in_wording_agree():
    # Stability is about the answer, not the phrasing, or every run would look unstable.
    reworded = perfect_answer()
    for s in reworded["situations"]:
        for b in s["behaviors"]:
            b["description"] += " (reworded)"
    replies = iter([json.dumps(perfect_answer()), json.dumps(reworded), json.dumps(perfect_answer(b1="escape"))])
    results, _, _, _ = run_one(lambda kw: next(replies), runs=3)
    assert results[0].stability == pytest.approx(2 / 3)


# ── The spending stop ────────────────────────────────────────────────────────

def test_spending_limit_stops_the_run():
    # 2000 in + 500 out on Sonnet 4.6 is $0.0135 a call. The first call is judged on its
    # max_tokens ($0.0614), later ones on the dearest so far. A $0.07 limit allows 5 calls: after
    # the fifth, $0.0675 spent plus a $0.0135 estimate would pass the limit.
    cases = load_cases("monitoring_analysis", limit=3)
    b = Budget(0.07)
    client = FakeClient(lambda kw: json.dumps({"situations": []}))
    results, stopped = run_cases(ma, cases, MeteredClient(client, b), runs=2)
    assert len(client.calls) == 5
    assert stopped and "spending limit" in stopped
    assert b.spent_usd <= 0.07
    assert [len(r.runs) for r in results] == [2, 2, 1]  # the runs done are kept


def test_first_call_is_refused_if_it_could_pass_the_limit():
    # Before any call, the estimate is the call's own max_tokens (4096 out = $0.06 on Sonnet 4.6).
    _, stopped, b, client = run_one(perfect_answer(), budget=0.01)
    assert stopped and client.calls == [] and b.spent_usd == 0


def test_unpriced_model_is_refused():
    # A model with no price cannot be held to a limit, so it is not called at all.
    client = FakeClient(lambda kw: "{}")
    with pytest.raises(ValueError):
        MeteredClient(client, Budget(10)).messages.create(model="claude-unknown", max_tokens=10, messages=[])
    assert client.calls == []


def test_cost_counts_cache_tokens():
    usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=0,
                            cache_creation_input_tokens=1_000_000, cache_read_input_tokens=1_000_000)
    assert Budget(1).cost("claude-sonnet-4-6", usage) == pytest.approx(3.00 + 3.75 + 0.30)


def test_budget_exceeded_is_raised_by_the_client():
    b = Budget(0.0)
    with pytest.raises(BudgetExceeded):
        MeteredClient(FakeClient(lambda kw: "{}"), b).messages.create(
            model="claude-sonnet-4-6", max_tokens=10, messages=[])


# ── The report ───────────────────────────────────────────────────────────────

def test_report_has_sample_sizes_and_no_case_text():
    # The report goes into pull requests and, later, is the shape of the held-out report, so it
    # must carry counts and no text from a case or the model's answers.
    cases = load_cases("monitoring_analysis", limit=2)
    b = Budget(10)
    client = FakeClient(lambda kw: json.dumps(perfect_answer()))
    results, stopped = run_cases(ma, cases, MeteredClient(client, b), runs=2)
    rep = report.build(ma, results, runs_per_case=2, cases_planned=2, budget=b, stopped=stopped)
    md = report.markdown(rep)
    blob = json.dumps(rep) + md

    assert rep["runs"] == 4 and rep["cases_run"] == 2
    assert rep["spent_usd"] > 0
    assert "of 4" in md  # check failures are shown out of the runs they were counted over
    assert rep["not_covered"] and "risk flag" in md

    for fid in [c.family_id for c in cases]:
        f = family(fid)
        for e in f["inputs"]["monitoring_log"]:
            for k in ("situation", "child_behavior_observed", "parent_response", "parent_words"):
                if e.get(k) and len(e[k]) > 12:
                    assert e[k] not in blob, f"case text in the report: {e[k]!r}"
        for s in f["facts"]["situations"]:
            assert s["name"] not in blob
            for bh in s["behaviors"]:
                assert bh["text"] not in blob
