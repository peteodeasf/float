"""Tests for the family generator. None of them calls the AI; a fake client stands in.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/generator
"""
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import family as fam  # noqa: E402
import generate  # noqa: E402
from spread import KINDS, POOL, plan  # noqa: E402

FACTS = {
    "anxiety": "fear of thunderstorms",
    "situations": [
        {"id": "s1", "name": "Storm at night", "fear_level": 8, "feared_outcome": "The roof will blow off",
         "behaviors": [{"id": "b1", "type": "safety", "text": "Sleeps in the parents' room"},
                       {"id": "b2", "type": "escape", "text": "Leaves the porch when thunder starts"}],
         "accommodations": [{"id": "a1", "text": "Dad checks the forecast out loud every evening"}]},
        {"id": "s2", "name": "Cloudy day at recess", "fear_level": None, "feared_outcome": None,
         "behaviors": [{"id": "b3", "type": "avoidance", "text": "Stays inside at recess"}],
         "accommodations": [{"id": "a2", "text": "Teacher lets him stay in the library"}]},
    ],
    "trap_ideas": ["a clock time in a note"],
}
INPUTS = {
    "monitoring_log": [
        {"date": "2026-10-03", "situation": "storm", "child_behavior_observed": "came to our room",
         "parent_response": "let him in", "fear_thermometer": 8, "parent_words": None, "situation_ref": "s1"},
        {"date": "2026-10-05", "situation": "recess", "child_behavior_observed": "stayed in",
         "parent_response": "emailed teacher", "fear_thermometer": None, "parent_words": None, "situation_ref": "s2"},
    ],
    "voice_notes": [{"text": "um storm again at 9 he came in", "expected": {"refs": ["s1", "b1"], "observations": 1,
                     "fear_level_said": None}, "trap": "9 is a time"}],
}


class FakeClient:
    """Returns the given replies in order and records each request."""

    def __init__(self, replies, usage=(2000, 3000), stop_reason="end_turn"):
        self.replies = list(replies)
        self.requests = []
        self.usage = usage
        self.stop_reason = stop_reason
        self.messages = self

    def create(self, **kw):
        self.requests.append(kw)
        text = self.replies.pop(0)
        return SimpleNamespace(
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
            usage=SimpleNamespace(input_tokens=self.usage[0], output_tokens=self.usage[1]),
            stop_reason=self.stop_reason,
        )


def slot():
    return plan(1, seed=1)[0]


# Why: a run of 5 should give one family of each kind the backlog asks for, not five of one.
def test_plan_spreads_the_five_kinds_ages_and_places():
    slots = plan(5, seed=7)
    assert sorted(s.kind for s in slots) == sorted(KINDS)
    assert all(8 <= s.age <= 17 for s in slots)
    assert len({s.age for s in slots}) == 5
    outside = [s for s in slots if s.place != "the US"]
    assert len(outside) == 3  # every other family is outside the US


# Why: a new family must never overwrite a hand-written one, and names must not repeat in the pool.
def test_plan_uses_new_ids_and_names():
    taken_ids = {p.stem for p in POOL.glob("*.json")}
    taken_names = {json.loads(p.read_text())["facts"]["child"]["name"] for p in POOL.glob("*.json")}
    slots = plan(12, seed=3)
    assert not {s.family_id for s in slots} & taken_ids
    assert len({s.family_id for s in slots}) == 12
    assert not {s.name for s in slots} & taken_names
    assert len({s.name for s in slots}) == 12


# Why: the same seed should give the same spread, so a rerun can be compared with the first run.
def test_plan_is_repeatable():
    assert plan(5, seed=11) == plan(5, seed=11)


# Why: the judgment cases follow a fixed rule in every hand-written family; code must match it.
def test_judgment_follows_the_pool_rule():
    j = fam.judgment_for(FACTS["situations"])
    assert j["step_sentences"] == [{"situation_ref": "s1", "behavior_ref": "b1"}]
    assert j["rungs"] == [{"situation_ref": "s1", "with_feared_outcome": True},
                          {"situation_ref": "s2", "with_feared_outcome": False}]


# Why: the answer key must not depend on the model getting name, age or the risk label right.
def test_assemble_sets_the_fixed_fields_and_passes_validate():
    s = slot()
    f = fam.assemble(s, copy.deepcopy(FACTS), copy.deepcopy(INPUTS), "SYNTHETIC — test")
    assert f["id"] == s.family_id and f["status"] == "pool"
    assert f["facts"]["child"] == {"name": s.name, "age": s.age}
    assert f["facts"]["risk"] == {"present": False, "detail": "", "confirmed": False}
    assert fam.problems(f, set()) == []


# Why: these are the mistakes a generating model makes that validate.py does not look for.
@pytest.mark.parametrize("break_it, expect", [
    (lambda f: f["facts"]["situations"][1]["behaviors"].append({"id": "b1", "type": "safety", "text": "x"}), "used twice"),
    (lambda f: f["inputs"]["monitoring_log"].pop(1), "s2: no log entry"),
    (lambda f: f["inputs"]["monitoring_log"][1].update(fear_thermometer=6), "fear_level is null"),
    (lambda f: f["inputs"]["monitoring_log"][0].update(date="Oct 3"), "not YYYY-MM-DD"),
    (lambda f: f["inputs"]["monitoring_log"][0].update(child_behavior_observed="ran to his mum"), "British spelling: mum"),
    (lambda f: f["inputs"]["voice_notes"][0]["expected"].update(observations=0), "observations"),
])
def test_extra_checks_catch_generator_mistakes(break_it, expect):
    f = fam.assemble(slot(), copy.deepcopy(FACTS), copy.deepcopy(INPUTS), "SYNTHETIC — test")
    break_it(f)
    assert any(expect in p for p in fam.problems(f, set())), fam.problems(f, set())


# Why: a family copied into an app prompt stops testing anything; validate.py's check must apply.
def test_family_sharing_words_with_a_prompt_is_refused():
    f = fam.assemble(slot(), copy.deepcopy(FACTS), copy.deepcopy(INPUTS), "SYNTHETIC — test")
    text = "the quick brown fox jumps over the lazy dog today"
    f["inputs"]["monitoring_log"][0]["child_behavior_observed"] = text
    assert any("seven-word" in p for p in fam.problems(f, fam.validate.shingles(text)))


# Why: the model sometimes wraps its JSON or writes a line first; that should not fail a family.
def test_parse_json_reads_wrapped_replies():
    assert fam.parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert fam.parse_json('Here it is:\n{"a": 1}') == {"a": 1}
    with pytest.raises(ValueError):
        fam.parse_json("no json here")


# Why: the whole loop, end to end, writes a valid family and spends what the usage says.
def test_run_writes_valid_families(tmp_path):
    client = FakeClient([json.dumps(FACTS), json.dumps(INPUTS)])
    outcomes, budget, stopped = generate.run(client, 1, 10.0, seed=1, out_dir=tmp_path)
    assert stopped is None and outcomes[0].family
    written = list(tmp_path.glob("*.json"))
    assert len(written) == 1
    assert fam.validate.check(written[0], set()) == []
    assert budget.calls == 2
    assert budget.spent == pytest.approx(2 * (2000 * 4 + 3000 * 20) / 1e6)
    # The trap ideas go to the inputs call but are not part of the answer key.
    assert "trap_ideas" not in json.loads(written[0].read_text())["facts"]
    assert "a clock time in a note" in client.requests[1]["messages"][0]["content"]


# Why: when inputs fail a check, the second try is told what failed; a second failure writes nothing.
def test_failed_inputs_are_retried_once_then_dropped(tmp_path):
    bad = copy.deepcopy(INPUTS)
    bad["monitoring_log"].pop(1)
    client = FakeClient([json.dumps(FACTS), json.dumps(bad), json.dumps(bad)])
    outcomes, _, _ = generate.run(client, 1, 10.0, seed=1, out_dir=tmp_path)
    assert outcomes[0].family is None
    assert "s2: no log entry" in client.requests[2]["messages"][0]["content"]
    assert not list(tmp_path.glob("*.json"))


# Why: the spending limit must stop the run before a call that could go over it, not after.
def test_budget_stops_before_going_over(tmp_path):
    # Each call's worst case is a full 16,000-token answer, about $0.33. $0.35 allows one call only.
    client = FakeClient([json.dumps(FACTS), json.dumps(INPUTS)])
    outcomes, budget, stopped = generate.run(client, 3, 0.35, seed=1, out_dir=tmp_path)
    assert stopped and "limit" in stopped
    assert budget.calls == 1 and len(client.requests) == 1
    assert budget.spent <= 0.35
    assert not list(tmp_path.glob("*.json"))


# Why: a refused or cut-off reply is a failed family, not a crash that loses the rest of the run.
def test_refusal_fails_the_family_and_the_run_continues(tmp_path):
    client = FakeClient(["", ""], stop_reason="refusal")
    outcomes, _, stopped = generate.run(client, 2, 10.0, seed=1, out_dir=tmp_path)
    assert stopped is None
    assert [o.problems for o in outcomes] == [["facts: the model declined"]] * 2


# Why: a reply with the wrong shape must fail its own family, not crash the night's run.
def test_misshapen_reply_fails_the_family_only(tmp_path):
    no_ids = {"situations": [{"name": "x", "behaviors": [{"type": "safety", "text": "y"}]}]}
    client = FakeClient([json.dumps(no_ids), json.dumps(INPUTS), json.dumps(INPUTS)])
    outcomes, _, stopped = generate.run(client, 1, 10.0, seed=1, out_dir=tmp_path)
    assert stopped is None and outcomes[0].family is None
    assert "not shaped like a family" in outcomes[0].problems[0]


# Why: the summary goes into a PR, so it must hold counts and labels, never the log text.
def test_summary_has_no_case_text(tmp_path):
    client = FakeClient([json.dumps(FACTS), json.dumps(INPUTS)])
    outcomes, budget, stopped = generate.run(client, 1, 10.0, seed=1, out_dir=tmp_path)
    text = generate.summary(outcomes, budget, stopped, 1)
    assert "Wrote 1" in text and "$" in text
    for e in INPUTS["monitoring_log"]:
        assert e["child_behavior_observed"] not in text
    assert INPUTS["voice_notes"][0]["text"] not in text


# Why: the backlog rule is to refuse without a key rather than look for one.
def test_refuses_without_a_key(monkeypatch, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert generate.main(["--count", "1"]) == 2
    assert "ANTHROPIC_API_KEY is not set" in capsys.readouterr().err
