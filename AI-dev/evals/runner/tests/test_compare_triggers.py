"""Tests for compare_triggers.py, which counts the triggers each monitoring prompt adds. A fake AI
client answers every call, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests
"""
import json
import dataclasses

import compare_triggers as ct
from budget import Budget, MeteredClient
from cases import load_cases
from test_runner import FAMILY, FakeClient, family, perfect_answer

REPORT_NAMES = ["Theme one (logged part, made-up part)", "A trigger nobody logged"]


def report_reply():
    return {"situations": [{"name": n, "fear_thermometer": 5} for n in REPORT_NAMES],
            "parental_responses": [], "safety_behaviors": [],
            "safety_section_label": "Safety & avoidance behaviors", "treatment_targets": []}


def all_entries():
    return list(range(1, len(family()["inputs"]["monitoring_log"]) + 1))


def matcher_for_report():
    """The first report situation covers every entry and names one unlogged trigger; the second is
    backed by nothing."""
    return {"situations": [{"n": 1, "entries": all_entries(), "not_in_log": ["made-up part"]},
                           {"n": 2, "entries": [], "not_in_log": []}]}


def matcher_for_extraction(user_text):
    """Each extraction situation matched, by name, to the entries the perfect answer cites. The list
    arrives in the app's order (most evidence first), not the answer's."""
    entries = {s["name"]: s["entries"] for s in perfect_answer()["situations"]}
    listed = user_text.split("The list:\n\n", 1)[1].splitlines()
    names = [line.split(". ", 1)[1] for line in listed if line.strip()]
    return {"situations": [{"n": i, "entries": entries[n], "not_in_log": []}
                           for i, n in enumerate(names, 1)]}


def respond(kw):
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT, PRELIMINARY_REPORT_SYSTEM_PROMPT
    if kw["system"] == EXTRACTION_SYSTEM_PROMPT:
        return json.dumps(perfect_answer())
    if kw["system"] == PRELIMINARY_REPORT_SYSTEM_PROMPT:
        return json.dumps(report_reply())
    user = kw["messages"][0]["content"]
    return json.dumps(matcher_for_report() if REPORT_NAMES[0] in user else matcher_for_extraction(user))


def run(runs=1, budget=10.0, answer=respond):
    client = FakeClient(answer)
    b = Budget(budget)
    results, stopped = ct.run_all(MeteredClient(client, b), load_cases("monitoring_analysis", [FAMILY]), runs)
    return results, stopped, b, client


def test_counts_a_whole_added_situation_and_an_added_part():
    # The two kinds of addition the report prompt invites: a trigger with no entry behind it, and a
    # logged theme widened with triggers nobody logged. Both must be counted, and kept apart.
    results, stopped, _, _ = run()
    s = results[0]["runs"][0]["score"]
    assert stopped is None
    assert s["report"] == {"situations": 2, "added": 1, "added_parts": 1, "linked": 1, "split": 0}
    # A perfect extraction adds nothing.
    assert s["extraction"]["added"] == s["extraction"]["added_parts"] == s["extraction"]["split"] == 0
    assert s["extraction"]["linked"] == s["extraction"]["situations"]


def test_matcher_is_blind_to_which_prompt_wrote_the_list_and_on_another_model():
    # The matcher must not mark the two prompts differently because it knows which is which, and it
    # must not be the model whose work it is marking.
    from app.services.insight_service import EXTRACTION_MODEL, REPORT_MODEL
    _, _, _, client = run()
    matcher_calls = [c for c in client.calls if c["system"] == ct.MATCHER_PROMPT]
    assert len(matcher_calls) == 2
    for c in matcher_calls:
        assert c["model"] not in (EXTRACTION_MODEL, REPORT_MODEL)
        text = (c["system"] + c["messages"][0]["content"]).lower()
        assert "report" not in text and "extraction" not in text


def test_matcher_gets_the_same_numbered_log_the_app_sends():
    # Entry numbers in the matcher's answer are mapped to the answer key by position, so it must see
    # the exact numbered text the extraction call saw.
    _, _, _, client = run()
    sent = client.calls[0]["messages"][0]["content"]
    for c in client.calls:
        if c["system"] == ct.MATCHER_PROMPT:
            assert sent in c["messages"][0]["content"]


def test_matcher_entry_numbers_outside_the_log_are_dropped():
    # A number the matcher made up would map to the wrong entry, or crash. The app drops such numbers
    # for the extraction's own citations, and so does this.
    match = ct.read_match(json.dumps({"situations": [{"n": 1, "entries": [0, 2, 99, "x", 2], "not_in_log": None}]}),
                          count=1, entry_count=5)
    assert match == [{"entries": [2], "not_in_log": []}]


def test_a_matcher_reply_missing_a_situation_is_not_scored():
    # Counting a situation the matcher skipped as "added" would inflate the count; the run is marked
    # as failed instead.
    assert ct.read_match(json.dumps({"situations": [{"n": 1, "entries": [1]}]}), count=2, entry_count=5) is None
    assert ct.read_match("no json here", count=1, entry_count=5) is None


def test_an_unreadable_matcher_reply_records_the_step_and_the_next_run_goes_on():
    def answer(kw):
        if kw["system"] == ct.MATCHER_PROMPT:
            return "not json"
        return respond(kw)
    results, _, _, _ = run(runs=2, answer=answer)
    runs = results[0]["runs"]
    assert len(runs) == 2
    assert runs[0]["error"] == "matcher:extraction: ValueError"
    assert runs[0]["score"] == {}


def test_spending_limit_stops_part_way_and_keeps_finished_runs():
    # The session has a hard spending cap. Each run is four calls; the limit lands inside the
    # second run, which must not be reported as if it finished.
    # A run costs $0.42 here: two app calls at $0.09 and two matcher calls at $0.12.
    client = FakeClient(respond, tokens_in=20000, tokens_out=2000)
    b = Budget(0.60)
    results, stopped = ct.run_all(MeteredClient(client, b), load_cases("monitoring_analysis", [FAMILY]), 3)
    assert stopped and "spending limit" in stopped
    assert len(results[0]["runs"]) == 1
    assert b.spent_usd <= b.limit_usd


def test_log_is_put_in_date_order_with_its_answer_key():
    # The route reads entries oldest first. A log out of order must be renumbered the same way, and
    # each entry must keep its own situation_ref, or matches land on the wrong situation.
    case = load_cases("monitoring_analysis", [FAMILY])[0]
    log = case.input["monitoring_log"]
    refs = case.expected["entry_refs"]
    shuffled = dataclasses.replace(case, input={"monitoring_log": log[::-1]},
                                   expected={**case.expected, "entry_refs": refs[::-1]})
    fixed = ct.in_date_order(shuffled)
    assert [e["date"] for e in fixed.input["monitoring_log"]] == sorted(e["date"] for e in log)
    by_date = {id(e): r for e, r in zip(log, refs)}
    assert [by_date[id(e)] for e in fixed.input["monitoring_log"]] == fixed.expected["entry_refs"]


def test_report_has_sample_sizes_and_no_case_text():
    # The report goes in a pull request. It must carry counts with what they are out of, and no
    # family text or model answers (those stay in outputs.jsonl).
    results, stopped, b, _ = run(runs=2)
    rep = ct.build_report(results, runs_per_case=2, cases_planned=1, budget=b, stopped=stopped)
    md = ct.markdown(rep)
    assert "2/4 (0.50)" in md  # report: 1 of 2 situations added in each of 2 runs
    assert "2/2 (1.00)" in md  # report: every run added something
    assert rep["report"]["stability"] == {"mean": 1.0, "cases_all_runs_agree": 1, "cases": 1}
    texts = [e[k] for e in family()["inputs"]["monitoring_log"] for k in ("situation", "child_behavior_observed")
             if e.get(k)]
    for t in texts + REPORT_NAMES + ["made-up part"]:
        assert t not in md and t not in json.dumps(rep)
