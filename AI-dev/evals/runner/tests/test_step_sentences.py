"""Tests for the step-sentence runner. A fake AI client stands in for the API, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests
"""
import json
from collections import Counter
from types import SimpleNamespace

import pytest

import report
import step_sentences as ss
from budget import Budget, MeteredClient
from cases import STEP_SET, half, load_cases
from engine import run_cases
from test_runner import FakeClient, family

FAMILY = "fam-social-01"


class TextClient(FakeClient):
    """A FakeClient whose replies look like the API's: text blocks with a type, and a stop reason.
    The app's wording call reads only blocks typed "text"."""

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._respond(kwargs))],
                               usage=self._usage, stop_reason="end_turn")


class ReviewingClient(TextClient):
    """Answers the feature's calls with `sentence(kwargs)` and the reviewers' with `verdict(kwargs)`,
    told apart by model."""

    def __init__(self, sentence, verdict):
        from app.services.combination_wording import MODEL
        super().__init__(lambda kw: sentence(kw) if kw["model"] == MODEL else
                         (lambda v: v if isinstance(v, str) else json.dumps(v))(verdict(kw)))


def run(sentence="Say hello without hiding", verdict=None, runs=1, fid=FAMILY):
    cases = load_cases("step_sentences", [fid])
    b = Budget(10)
    respond = sentence if callable(sentence) else (lambda kw: sentence)
    if verdict is None:
        client = TextClient(respond)
        hooks = []
    else:
        client = ReviewingClient(respond, verdict)
        hooks = ss.reviewer_hooks(MeteredClient(client, b))
    results, stopped = run_cases(ss, cases, MeteredClient(client, b), runs, hooks)
    return cases, results, b, client, hooks


# ── The set ──────────────────────────────────────────────────────────────────

def test_the_committed_set_is_thirty_pairs_five_per_kind_working_half_only():
    # The backlog asked for about 30 pairs across kinds of anxiety. Working half only, because the
    # prompt may be tuned on these and the held-out pairs must stay unseen.
    pairs = json.loads(STEP_SET.read_text())
    assert len(pairs) == 30
    assert len({(p["family"], p["situation_ref"], p["behavior_ref"]) for p in pairs}) == 30
    assert set(Counter(ss.kind(p["family"]) for p in pairs).values()) == {5}
    assert all(half(p["family"]) == "working" for p in pairs)


def test_every_pair_is_a_safety_behavior_the_pool_lists_as_a_step_sentence():
    # A combination is a situation without one safety behavior. An avoidance makes no combination
    # (Peter, 2026-10-15), so a pair pointing at anything else would test a step that cannot exist.
    for p in json.loads(STEP_SET.read_text()):
        f = family(p["family"])
        ref = {"situation_ref": p["situation_ref"], "behavior_ref": p["behavior_ref"]}
        assert ref in f["judgment"]["step_sentences"]
        s = next(s for s in f["facts"]["situations"] if s["id"] == p["situation_ref"])
        assert next(b for b in s["behaviors"] if b["id"] == p["behavior_ref"])["type"] == "safety"


def test_the_committed_set_follows_the_rule_that_picks_it():
    # Nobody hand-picked the pairs. If the pool's committed families change, the file is rebuilt
    # with --write-set rather than edited.
    assert json.loads(STEP_SET.read_text()) == ss.choose_set()


def test_kinds_take_turns_so_a_stopped_run_keeps_every_kind():
    # The spending limit can stop a run part-way. Taking the kinds in turn means the first six
    # pairs already cover all six.
    cases = load_cases("step_sentences")
    first = [c.family_id for c in cases[:12]]
    assert len({ss.kind(f) for f in first}) == 6
    assert [c.expected["mode"] for c in cases[:4]] == ["app", "does", "app", "does"]


# ── The cases ────────────────────────────────────────────────────────────────

def test_the_two_modes_differ_only_in_the_one_prompt_line():
    # The open question is tested by changing one line. Anything else different between "app" and
    # "does" would make the comparison mean nothing.
    assert ss.APP_LINE in ss.app_prompt()
    assert ss.does_prompt() == ss.app_prompt().replace(ss.APP_LINE, ss.DOES_LINE)
    app, does = load_cases("step_sentences", [FAMILY])[:2]
    assert app.input == does.input
    assert {**app.expected, "mode": "does"} == does.expected


def test_the_does_prompt_refuses_to_run_when_the_apps_line_changes(monkeypatch):
    # If someone rewords the app's prompt, a silent replace would run "does" on the app's prompt and
    # report two identical modes as a finding.
    monkeypatch.setattr("app.services.combination_wording.SYSTEM_PROMPT", "something else")
    with pytest.raises(ValueError, match="APP_LINE"):
        ss.does_prompt()


def test_the_call_is_the_apps_and_is_metered():
    # The runner must test the app's prompt, model and input text, not a copy, and every call must
    # go through the spending meter.
    from app.services.combination_wording import MODEL, SYSTEM_PROMPT, user_text
    cases, _, b, client, _ = run()
    i = cases[0].input
    assert client.calls[0]["model"] == MODEL
    assert client.calls[0]["system"] == SYSTEM_PROMPT
    assert client.calls[1]["system"] == ss.does_prompt()
    assert client.calls[0]["messages"][0]["content"] == user_text(i["situation"], i["behavior"])
    assert b.calls == len(cases) and b.spent_usd > 0


def test_the_childs_age_goes_to_the_reviewers_not_to_the_feature():
    # The app does not send the age, so the feature must not get it. The age reviewer needs it.
    case = load_cases("step_sentences", [FAMILY])[0]
    assert "age" not in case.input
    assert case.expected["age"] == family()["facts"]["child"]["age"]


# ── Reading and scoring ──────────────────────────────────────────────────────

def test_an_empty_reply_is_where_the_app_shows_its_template():
    # The app falls back to "<situation> — without: <behavior>" on an empty reply. That is not a
    # drafted sentence, so it must not be scored as one.
    _, results, _, _, _ = run(sentence="")
    r = results[0].runs[0]
    assert r.parsed is None and r.checks == {"app_can_read": ["no sentence; the app would show its template"]}


def test_form_and_added_words_are_counted_per_mode():
    # "Names what stops" is the open question's measure, and "added words" is the cost the "does"
    # form may carry ("Sit in your usual seat" adds "usual seat"). Both must stay apart by mode.
    def sentence(kw):
        return ("Order at a restaurant without whispering to mom" if kw["system"] == ss.app_prompt()
                else "Tell the server your order in a clear loud voice")
    _, results, _, _, _ = run(sentence=sentence)
    app, does = results[0].runs[0].score, results[1].runs[0].score
    assert app["names_what_stops_app"] == 1 and app["runs_does"] == 0
    assert does["names_what_stops_does"] == 0 and does["runs_app"] == 0
    # "without" is the form, not content, so it is not counted as added.
    assert "without" not in app["added_list"]
    assert does["added_words_does"] > 0 and "loud" in does["added_list"]


def test_long_sentences_and_british_spelling_fail_their_checks():
    # The prompt asks for under about fifteen words and American spelling. A failure here is the
    # prompt's rule not being followed.
    _, results, _, _, _ = run(sentence=" ".join(["word"] * 16) + " mum")
    checks = results[0].runs[0].checks
    assert checks["at_most_15_words"] and checks["american_spelling"]


def test_only_the_first_line_is_kept_as_the_app_does():
    # The clinician is shown the first line only, so that is what is scored and reviewed.
    _, results, _, _, _ = run(sentence='Say hello on your own\nHere is why: ...')
    assert results[0].runs[0].parsed == {"sentence": "Say hello on your own"}


# ── The reviewers ────────────────────────────────────────────────────────────

def test_reviewers_run_on_another_model_and_their_counts_go_in_the_report():
    # The report is what goes in the pull request. It must say, by mode, what the reviewers
    # objected to, by rule id only, and that their verdicts are unchecked.
    def verdict(kw):
        if "supervising psychologist's written rules" in kw["system"]:
            return {"items": [{"n": 1, "verdict": "dont_show",
                               "objections": [{"rule": "no-way-out", "reason": "x"}]}]}
        return {"items": [{"n": 1, "verdict": "show", "objections": []}]}
    from app.services.combination_wording import MODEL
    cases, results, b, client, hooks = run(verdict=verdict)
    reviewer_calls = [c for c in client.calls if c["model"] != MODEL]
    assert reviewer_calls and len(reviewer_calls) == 3 * len(cases)
    rep = report.build(ss, results, runs_per_case=1, cases_planned=len(cases), budget=b,
                       stopped=None, reviewers=hooks)
    assert set(rep["reviews"]) == {"app", "does"}
    assert rep["reviews_checked"] is False
    app = rep["reviews"]["app"]
    assert app["her_rules"]["dont_show"] == app["her_rules"]["items"] == len(cases) // 2
    assert app["her_rules"]["broken"] == {"no-way-out": len(cases) // 2}
    assert app["age"]["show"] == app["age"]["items"]
    # One reviewer finding a broken rule is enough for "don't show" all together.
    assert app["all reviewers together"]["dont_show"] == len(cases) // 2
    md = report.markdown(rep)
    assert "**Unchecked.**" in md and "### does" in md
    assert "x" not in json.dumps(rep["reviews"])  # reasons stay out of the report


def test_the_report_holds_no_sentence_text():
    # report.md goes in a pull request; the model's sentences go in outputs.jsonl only.
    cases, results, b, _, _ = run(sentence="Zebra quokka marmoset")
    rep = report.build(ss, results, runs_per_case=1, cases_planned=len(cases), budget=b, stopped=None)
    text = json.dumps(rep) + report.markdown(rep)
    assert "Zebra" not in text and "quokka" not in text
    assert "quokka" in report.outputs_jsonl(results)


def test_a_reviewer_reply_that_cannot_be_read_counts_as_unanswered():
    # A reviewer that answered nothing readable must not count as "show", or a broken reviewer
    # would look like one that approved everything.
    cases, results, b, _, hooks = run(verdict=lambda kw: "not json at all")
    rep = report.build(ss, results, runs_per_case=1, cases_planned=len(cases), budget=b,
                       stopped=None, reviewers=hooks)
    t = rep["reviews"]["app"]["her_rules"]
    assert t["unanswered"] == t["items"] > 0 and t["show"] == 0


def test_the_fake_client_never_sends_the_age_to_the_feature():
    # Belt and braces for the age: nothing in the feature's message names it.
    cases, _, _, client, _ = run()
    age = str(cases[0].expected["age"])
    from app.services.combination_wording import MODEL
    assert all(age not in c["messages"][0]["content"] for c in client.calls if c["model"] == MODEL)


def test_runs_are_metered_through_a_refusal():
    # A refusal from the API is the app's template on screen: unreadable here, not a crash.
    class Refusing(TextClient):
        def create(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(content=[], usage=self._usage, stop_reason="refusal")
    cases = load_cases("step_sentences", [FAMILY])
    b = Budget(10)
    results, _ = run_cases(ss, cases, MeteredClient(Refusing(lambda kw: ""), b), 1)
    assert all(r.parsed is None for c in results for r in c.runs) and b.calls == len(cases)
