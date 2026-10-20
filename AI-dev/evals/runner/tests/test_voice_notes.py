"""Tests for scoring voice notes. A fake AI client stands in for the API, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests
"""
import json

import report
import voice_notes as vn
from budget import Budget, MeteredClient
from cases import POOL, load_cases
from engine import run_cases
from test_runner import FakeClient, family

FAMILY = "fam-social-01"
# fam-social-01's first note: two moments, the parent said "a 6" for the first, and "6:30" and
# "4 people" are there to be mistaken for Fear Levels.
NOTE = 1


def obs(situation="At the taco place", child="He whispered his order to me", parent="I ordered for him",
        fear=None):
    return {"situation": situation, "child": child, "parent": parent, "fear": fear}


def run_note(answer, runs=1, note=NOTE, fid=FAMILY):
    case = [c for c in load_cases("voice_notes", [fid]) if c.id.endswith(f"/{note}")]
    b = Budget(10)
    client = FakeClient(answer if callable(answer) else (lambda kw: json.dumps(answer)))
    results, stopped = run_cases(vn, case, MeteredClient(client, b), runs)
    return results, b, client


def first(answer, **kw):
    results, _, _ = run_note(answer, **kw)
    return results[0].runs[0]


# ── The cases ────────────────────────────────────────────────────────────────

def test_one_case_per_note_and_the_answer_key_stays_out_of_the_input():
    # Float is given the parent's words and nothing else. If the trap or the expected count leaked
    # into the input, the score would mean nothing.
    cases = load_cases("voice_notes", [FAMILY])
    notes = family()["inputs"]["voice_notes"]
    assert [c.id for c in cases] == [f"{FAMILY}/voice_notes/{n}" for n in range(1, len(notes) + 1)]
    assert cases[0].input == {"text": notes[0]["text"]}
    assert cases[0].expected == {"observations": 2, "fear_level_said": 6}


def test_limit_counts_families_and_every_note_in_the_pool_is_a_case():
    # `--limit 5` means five families, however many notes they have. And no note is quietly lost.
    five = load_cases("voice_notes", limit=5)
    assert len({c.family_id for c in five}) == 5
    total = sum(len(json.loads(f.read_text())["inputs"].get("voice_notes", []))
                for f in POOL.glob("*.json"))
    assert len(load_cases("voice_notes")) == total


# ── It runs the app's code, not a copy ───────────────────────────────────────

def test_the_call_is_the_apps_own_and_is_metered():
    # The point of the runner: it scores the prompt and model the app uses. And every call has to
    # go through the spending meter, or the $10 limit means nothing.
    from app.services.monitoring_capture import WRITE_UP_MODEL, _prompt
    _, b, client = run_note({"observations": []})
    kw = client.calls[0]
    assert kw["system"] == _prompt()
    assert kw["model"] == WRITE_UP_MODEL
    assert kw["messages"][0]["content"] == family()["inputs"]["voice_notes"][0]["text"]
    assert b.calls == 1 and b.spent_usd > 0


# ── Splitting into observations ──────────────────────────────────────────────

def test_right_count_and_fear_level_scores_full_marks():
    run = first({"observations": [obs(fear=6), obs("Leaving", "Looked at his shoes", "His dad answered")]})
    s = run.score
    assert (s["moments"], s["observations"], s["count_right"], s["too_many"], s["too_few"]) == (2, 2, 1, 0, 0)
    assert (s["fear_said"], s["fear_kept"], s["fear_other"], s["fear_repeated"]) == (1, 1, 0, 0)
    assert not any(run.checks.values())


def test_too_many_too_few_and_none_found():
    # The three ways the split goes wrong are counted apart, because they mean different things:
    # one moment cut in pieces, two moments run together, or the words saved with nothing found.
    assert first({"observations": [obs(), obs(), obs()]}).score["too_many"] == 1
    few = first({"observations": [obs()]}).score
    assert (few["too_few"], few["none_found"]) == (1, 0)
    none = first({"observations": []}).score
    assert (none["observations"], none["too_few"], none["none_found"]) == (0, 1, 1)


def test_an_empty_observation_is_not_counted():
    # The app drops an observation with nothing in it, so the score must too: it scores what is saved.
    s = first({"observations": [obs(fear=6), obs(), {"situation": "", "child": " ", "parent": ""}]}).score
    assert s["observations"] == 2


# ── Fear Levels ──────────────────────────────────────────────────────────────

def test_a_number_that_is_not_a_rating_is_dropped_by_the_app_and_shown_by_the_check():
    # "4 people" is a count. The app's guard drops it, so the parent never sees it and it is not a
    # wrong Fear Level saved. The check still shows the model offered it.
    run = first({"observations": [obs(fear=4), obs()]})
    assert run.score["fear_other"] == 0 and run.score["fear_kept"] == 0
    assert run.checks["fear_said_as_rating"] == ["Fear Level 4 dropped by the app"]


def test_the_said_fear_level_on_both_moments_is_counted_as_repeated():
    # The parent said one number about one moment. Putting it on the other moment as well is a
    # Fear Level they did not give for it.
    s = first({"observations": [obs(fear=6), obs(fear=6)]}).score
    assert (s["fear_kept"], s["fear_repeated"]) == (1, 1)


def test_a_saved_fear_level_when_none_was_said_is_counted():
    # fam-school-05's note has "twenty minutes" and "second time" and no Fear Level. A rating that
    # gets past the app's guard there is one the parent never gave.
    text = load_cases("voice_notes", ["fam-school-05"])[0].input["text"]
    assert "a seven" not in text
    case = load_cases("voice_notes", ["fam-school-05"])[0]
    prepared = {"text": text + " she was like a seven"}
    s = vn.score(case, prepared, {"observations": [obs(fear=7)]})
    assert (s["fear_said"], s["fear_kept"], s["fear_other"]) == (0, 0, 1)


# ── The parent's words ───────────────────────────────────────────────────────

def test_words_added_and_feeling_words_are_counted():
    # The prompt says keep the parent's words and do not explain or diagnose. "Anxious" when the
    # parent never said it is the model describing the child in its own words.
    plain = first({"observations": [obs("taco place", "he whispered it to me", "i just said it for him", 6)]}).score
    assert plain["words_added"] == 0 and plain["note_words_kept"] > 0
    labelled = first({"observations": [obs("taco place", "he was anxious and whispered", "i said it", 6)]}).score
    assert labelled["feelings_added"] == 1 and labelled["words_added"] == 1


def test_content_words_ignore_fillers_endings_and_number_spelling():
    # The note is speech-to-text, the observation is tidied. "um", "whispering"/"whispered" and
    # "six"/"6" must not count as words added or lost.
    assert vn.content_words("um so he was whispering it like six times") == \
        vn.content_words("He whispered it 6 times.")
    # Found on the first real run: "getting" and "taking" came out as words the parent never said.
    assert vn.content_words("getting ready taking the trash out") == vn.content_words("take the trash")  \
        | vn.content_words("ready")
    # And "6pm" for the parent's "at like 6".
    assert vn.content_words("At 6pm.") == vn.content_words("at like 6")


# ── Reading the reply, stability, the report ─────────────────────────────────

def test_an_unreadable_reply_fails_the_check_and_is_not_scored():
    run = first(lambda kw: "sorry, I can't")
    assert run.checks == {"app_can_read": ["the app's reader could not read the reply"]}
    assert run.score is None and run.signature == "unreadable"


def test_runs_agree_on_count_and_fear_levels_not_wording():
    # Stability is about what is saved, not how it is worded, or every run would disagree.
    answers = iter([
        {"observations": [obs(fear=6), obs("Leaving")]},
        {"observations": [obs("Taco shop", fear=6), obs("Outside")]},
        {"observations": [obs(fear=6)]},
    ])
    results, _, _ = run_note(lambda kw: json.dumps(next(answers)), runs=3)
    assert round(results[0].stability, 2) == 0.67


def test_report_has_voice_note_scores_and_no_note_text():
    # The report goes into pull requests: counts with their sample sizes, and none of the notes'
    # words or the model's answers.
    cases = load_cases("voice_notes", limit=2)
    b = Budget(10)
    client = FakeClient(lambda kw: json.dumps({"observations": [obs(fear=6)]}))
    results, stopped = run_cases(vn, cases, MeteredClient(client, b), runs=2)
    rep = report.build(vn, results, runs_per_case=2, cases_planned=len(cases), budget=b, stopped=stopped)
    md = report.markdown(rep)
    assert rep["totals"]["notes"] == 2 * len(cases)
    assert f"| Notes split into the right number of observations | {rep['totals']['count_right']}/{2 * len(cases)}" in md
    assert "Fear Level said and saved" in md and "Which situation each observation" in md
    blob = json.dumps(rep) + md
    for c in cases:
        assert c.input["text"][:40] not in blob
    assert "whispered his order" not in blob
