"""Tests for the held-out run. A fake AI client stands in for the API, so nothing is spent.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/judging/tests

Waiting-pool families stand in for held-out cases. They are copied into a temporary folder; the real
held-out folder is never read.
"""
import json
import shutil
from types import SimpleNamespace

import pytest

import run_held_out
from cases import POOL

FAMILIES = ["fam-social-01", "fam-health-01"]


class FakeClient:
    def __init__(self, respond):
        self._respond = respond
        self.messages = self
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(content=[SimpleNamespace(text=self._respond(kwargs))],
                               usage=SimpleNamespace(input_tokens=2000, output_tokens=500))


def family(fid):
    return json.loads((POOL / f"{fid}.json").read_text())


def answer_quoting_the_case(fid):
    """A reply that repeats the family's own words, so a leak of the model's answer would show up as
    case text in the output."""
    f = family(fid)
    log = f["inputs"]["monitoring_log"]
    return {"situations": [
        {
            "name": s["name"],
            "fear_rating": None,
            "behaviors": [{"order": n, "type": b["type"], "description": b["text"]}
                          for n, b in enumerate(s["behaviors"], 1)],
            "accommodations": [{"description": a["text"]} for a in s["accommodations"]],
            "entries": [i for i, e in enumerate(log, 1) if e["situation_ref"] == s["id"]],
        }
        for s in f["facts"]["situations"]
    ]}


def strings(x):
    """Every string in a JSON value, keys and values."""
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield k
            yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)


@pytest.fixture
def held_out_folder(tmp_path):
    for fid in FAMILIES:
        shutil.copy(POOL / f"{fid}.json", tmp_path / f"{fid}.json")
    return tmp_path


def run_main(capsys, monkeypatch, folder, respond, *args):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    client = FakeClient(respond)
    code = run_held_out.main(["--folder", str(folder), "--runs", "2", *args], make_client=lambda: client)
    out = capsys.readouterr()
    return code, out.out + out.err, client


@pytest.mark.parametrize("fmt", [[], ["--json"]])
def test_output_has_scores_and_counts_and_no_case_text(capsys, monkeypatch, held_out_folder, fmt):
    # The point of the folder: the agent tuning prompts sees how it did on the held-out cases and
    # nothing it could tune against. So the printed output must carry the scores with their sample
    # sizes, and no text from a case, no part of the model's answers, and no case ids (a per-case
    # score says which case to go and read).
    reply = json.dumps(answer_quoting_the_case(FAMILIES[0]))
    code, out, client = run_main(capsys, monkeypatch, held_out_folder, lambda kw: reply, *fmt)

    assert code == 0
    assert client.calls == 4  # 2 cases, 2 runs each
    if fmt:
        rep = json.loads(out)
        assert rep["held_out"] is True
        assert rep["runs"] == 4 and rep["cases_run"] == 2
        assert rep["totals"]["situations"] > 0
        assert "per_case" not in rep
    else:
        assert "held-out cases, scores only" in out
        assert "2 of 2 cases, 2 runs each: 4 runs" in out
        assert "Situations found: " in out and "Behavior types right" in out
        assert "| app_can_read | 0 of 4 |" in out
        assert "Per case" not in out

    for fid in FAMILIES:
        assert fid not in out, f"case id in the output: {fid}"
        f = family(fid)
        # Anything from the case written in words, three or more, is case text. Short strings are
        # field names and labels ("safety", "s1") that the report uses too.
        for text in strings({k: v for k, v in f.items() if k != "id"}):
            if len(text.split()) >= 3:
                assert text not in out, f"case text in the output: {text!r}"


def test_an_error_prints_its_type_only(capsys, monkeypatch, held_out_folder):
    # An error message can quote the input. Python's "Invalid isoformat string: '...'" does. The held-out
    # run must not leak a case that way.
    path = held_out_folder / f"{FAMILIES[0]}.json"
    f = json.loads(path.read_text())
    secret = "the child hid behind the purple curtain"
    f["inputs"]["monitoring_log"][0]["date"] = secret
    path.write_text(json.dumps(f))

    code, out, _ = run_main(capsys, monkeypatch, held_out_folder, lambda kw: "{}")

    assert code == 1
    assert "ValueError" in out
    assert secret not in out and "purple" not in out


def test_empty_folder_runs_nothing(capsys, monkeypatch, tmp_path):
    # The real held-out folder starts empty. That should say so plainly, not report zeros as scores.
    code, out, client = run_main(capsys, monkeypatch, tmp_path, lambda kw: "{}")
    assert code == 0
    assert "No held-out cases yet" in out
    assert client.calls == 0


def test_no_api_key_runs_nothing(capsys, monkeypatch, held_out_folder):
    # Same rule as the runner: without the key, nothing runs and nothing is looked for.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    code = run_held_out.main(["--folder", str(held_out_folder)], make_client=lambda: pytest.fail("called"))
    assert code == 2
    assert "ANTHROPIC_API_KEY is not set" in capsys.readouterr().err


def test_spending_limit_still_applies(capsys, monkeypatch, held_out_folder):
    # The held-out run spends money like the working run, so the same limit must stop it.
    code, out, client = run_main(capsys, monkeypatch, held_out_folder, lambda kw: "{}", "--budget", "0.02")
    assert code == 0
    assert "Stopped early" in out
    assert client.calls < 4
