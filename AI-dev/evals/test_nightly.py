"""Tests for the overnight schedule. A fake stands in for every command (git, gh, the runner, the
generator), so nothing calls the AI, posts to GitHub or spends anything.

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/test_nightly.py
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import nightly  # noqa: E402

DAY = date(2026, 10, 20)
COMMITTED = ["fam-social-01", "fam-social-02", "fam-social-03", "fam-health-01"]
SCORES = [["Situations found", "situations_found", "situations"],
          ["Triggers not in the answer key", "extra_triggers", None]]


def report(spent=0.40, found=9, total=10, extra=2, families=3, runs=3, stability=1.0, prompt="abc"):
    """A runner report.json with the fields the schedule reads."""
    return {
        "feature": "monitoring_analysis", "prompt_sha256": prompt, "runs_per_case": runs,
        "cases_run": families, "families_run": families, "runs": families * runs,
        "runs_scored": families * runs, "spent_usd": spent, "stopped": None,
        "totals": {"situations_found": found, "situations": total, "extra_triggers": extra},
        "scores": SCORES, "stability": {"mean": stability, "cases": families,
                                        "cases_all_runs_agree": families},
        "per_case": [{"case": f"fam-social-0{i}/monitoring_analysis", "stability": stability}
                     for i in range(1, families + 1)],
    }


def done(stdout="", stderr="", code=0):
    return subprocess.CompletedProcess([], code, stdout, stderr)


class FakeShell:
    """Answers each command the schedule runs, and keeps a list of them."""

    def __init__(self, runner=None, held_out="No held-out cases yet. Nothing was run.\n", prs=(),
                 prints=None, merge_code=0, conflicted="", checkout_fails=()):
        self.calls: list[list[str]] = []
        self.runner = runner or (lambda cmd: (0, report()))
        self.held_out = held_out
        self.prs = list(prs)
        self.prints = prints or {}
        self.merge_code = merge_code
        self.conflicted = conflicted
        self.checkout_fails = set(checkout_fails)

    def __call__(self, cmd, cwd, timeout=None):
        cmd = [str(c) for c in cmd]
        self.calls.append(cmd)
        joined = " ".join(cmd)
        if cmd[:2] == ["git", "ls-files"]:
            if "--others" in cmd:
                return done("AI-dev/evals/pool/families/fam-new-01.json\n")
            return done("".join(f"AI-dev/evals/pool/families/{f}.json\n" for f in COMMITTED))
        if cmd[:2] == ["git", "rev-parse"]:
            return done("a" * 40 + "\n")
        if cmd[:2] == ["git", "merge"]:
            return done(code=self.merge_code, stderr="CONFLICT")
        if cmd[:2] == ["git", "diff"]:
            return done(self.conflicted)
        if cmd[:2] == ["git", "checkout"] and cmd[-1] in self.checkout_fails:
            return done(code=1)
        if cmd[0] == "git":
            return done()
        if cmd[:3] == ["gh", "pr", "list"]:
            return done(json.dumps(self.prs))
        if cmd[:3] == ["gh", "pr", "comment"]:
            return done()
        if joined.endswith("nightly.py fingerprint"):
            where = "pr" if "float-pr-" in joined else "main"
            return done(json.dumps(self.prints.get(where, {"monitoring_analysis": "m", "voice_notes": "v"})))
        if "runner/run.py" in joined:
            code, rep = self.runner(cmd)
            if rep is not None:
                out = Path(cmd[cmd.index("--out") + 1])
                out.mkdir(parents=True, exist_ok=True)
                (out / "report.json").write_text(json.dumps(rep))
            return done(code=code, stderr="" if code == 0 else "Traceback\nKeyError: boom")
        if "run_held_out.py" in joined:
            return done(self.held_out)
        if "generate.py" in joined:
            path = Path(cmd[cmd.index("--summary-json") + 1])
            path.write_text(json.dumps({"written": ["fam-new-01"], "failed": [], "stopped": None,
                                        "spent_usd": 1.25}))
            return done(code=0)
        raise AssertionError(f"unexpected command: {cmd}")

    def ran(self, part: str) -> list[list[str]]:
        return [c for c in self.calls if part in " ".join(c)]


def ctx(tmp_path, shell, limit=10.0, dry_run=False, day=DAY):
    return nightly.Ctx(checkout=tmp_path / "checkout", night=nightly.Night(tmp_path, day, limit, dry_run),
                       runs=3, sh=shell)


def budget_of(cmd):
    return float(cmd[cmd.index("--budget") + 1])


# Why: the schedule keeps its own list of features so it need not import the app. A feature added to
# the runner and not here would quietly never run at night.
def test_features_match_the_runner():
    sys.path.insert(0, str(nightly.HERE / "runner"))
    import run
    assert set(nightly.FEATURES) == set(run.FEATURES)


# Why: "local test database only". cron jobs must never start with DATABASE_URL pointing anywhere
# else, even though no job uses a database today.
@pytest.mark.parametrize("url,ok", [
    ("postgresql+asyncpg://float:float@localhost:5432/float_test", True),
    ("postgresql+asyncpg://float:float@localhost:5432/float_dev", False),
    ("postgresql://u:p@db.railway.internal:5432/float_test", False),
    (None, True),
])
def test_only_the_local_test_database(url, ok):
    env = {} if url is None else {"DATABASE_URL": url}
    assert (nightly.check_database(env) is None) == ok


# Why: the night has one limit. Each step must be given only what is left, so the night total cannot
# pass the limit however many steps there are.
def test_each_step_gets_only_what_is_left(tmp_path):
    shell = FakeShell(runner=lambda cmd: (0, report(spent=budget_of(cmd) - 0.5)))
    c = ctx(tmp_path, shell, limit=4.0)
    nightly.job_run(c)
    budgets = [budget_of(cmd) for cmd in shell.ran("runner/run.py")]
    assert budgets == [4.0, 0.5]
    assert c.night.spent() <= 4.0


# Why: with almost nothing left a step could not get through enough cases to mean anything, and it
# must say it was skipped rather than run on pennies.
def test_a_step_is_skipped_when_too_little_is_left(tmp_path):
    shell = FakeShell(runner=lambda cmd: (0, report(spent=9.8)))
    c = ctx(tmp_path, shell, limit=10.0)
    nightly.job_run(c)
    assert len(shell.ran("runner/run.py")) == 1
    skipped = [s for s in c.night.steps if s["status"] == "skipped"]
    assert {s["step"] for s in skipped} == {"held-out monitoring_analysis", "voice_notes",
                                            "held-out voice_notes"}


# Why: the night's limit is set by its first job. A later job started with a bigger --limit must not
# raise it, or the night could spend more than was set.
def test_a_later_job_cannot_raise_the_limit(tmp_path):
    nightly.Night(tmp_path, DAY, 5.0).save()
    assert nightly.Night(tmp_path, DAY, 50.0).limit == 5.0


# Why: a step that crashed may have spent money before it stopped. Not knowing how much, the night
# must count all it was allowed, rather than carry on and go over. A missing API key spends nothing.
def test_a_crash_counts_its_whole_allowance_and_a_missing_key_counts_nothing(tmp_path):
    shell = FakeShell(runner=lambda cmd: (1, None))
    c = ctx(tmp_path, shell, limit=10.0)
    nightly.job_run(c)
    assert c.night.steps[0]["status"] == "failed" and c.night.steps[0]["spent_usd"] == 10.0
    assert len(shell.ran("runner/run.py")) == 1

    shell = FakeShell(runner=lambda cmd: (2, None))
    c = ctx(tmp_path / "nokey", shell)
    nightly.job_run(c)
    assert c.night.spent() == 0 and len(shell.ran("runner/run.py")) == 2


# Why: a family the generator wrote on Sunday is not committed, and must not join the nightly sample
# until Peter accepts it, so scores stay comparable. Held-out (even) families never go to the runner.
def test_the_nightly_run_uses_committed_working_families_only(tmp_path):
    shell = FakeShell()
    nightly.job_run(ctx(tmp_path, shell))
    for cmd in shell.ran("runner/run.py"):
        assert cmd[cmd.index("--families") + 1] == "fam-health-01,fam-social-01,fam-social-03"


# Why: a dry run is how the schedule is checked without a key or money. It must call no AI script
# and post nothing, and its report must say it was a dry run.
def test_a_dry_run_calls_no_ai_and_posts_nothing(tmp_path):
    prs = [{"number": 7, "title": "Tighten the prompt", "headRefOid": "b" * 40, "isCrossRepository": False}]
    shell = FakeShell(prs=prs, prints={"pr": {"monitoring_analysis": "changed", "voice_notes": "v"}})
    c = ctx(tmp_path, shell, dry_run=True)
    for job in ("generate", "run", "score-prs"):
        nightly.JOBS[job](c)
    path = nightly.job_report(c)
    assert not shell.ran("runner/run.py") and not shell.ran("run_held_out.py")
    assert not shell.ran("generate.py") and not shell.ran("gh pr comment")
    assert c.night.spent() == 0
    assert "(dry run)" in path.read_text() and path.name.startswith("dry-run-")
    assert not (tmp_path / "scored-prs.json").exists()


# Why: a pull request is scored with main's cases and scoring code, so it cannot change how it is
# marked. Only its app code is its own.
def test_a_prompt_change_pr_is_scored_with_mains_scoring_code_and_posted(tmp_path):
    prs = [{"number": 7, "title": "Tighten the prompt", "headRefOid": "b" * 40, "isCrossRepository": False}]
    shell = FakeShell(prs=prs, prints={"pr": {"monitoring_analysis": "changed", "voice_notes": "v"}})
    c = ctx(tmp_path, shell)
    nightly.job_run(c)
    nightly.job_score_prs(c)
    checkout = [cmd for cmd in shell.ran("git checkout") if cmd[-1] == nightly.REL]
    assert checkout and checkout[0][2] == "a" * 40  # main's commit
    pr_runs = [cmd for cmd in shell.ran("runner/run.py") if "float-pr-7-" in " ".join(cmd)]
    assert [cmd[cmd.index("--feature") + 1] for cmd in pr_runs] == ["monitoring_analysis"]
    assert shell.ran("gh pr comment 7")
    body = (c.night.dir / "pr-7.md").read_text()
    assert "| Situations found | 9 of 10 | 9 of 10 |" in body
    assert json.loads((tmp_path / "scored-prs.json").read_text()) == {"7": "b" * 40}

    # Not scored again until it gets a new commit.
    shell.calls.clear()
    nightly.job_score_prs(c)
    assert not shell.ran("runner/run.py") and not shell.ran("gh pr comment")


# Why: most pull requests change no tested prompt. They must not cost anything or get a comment, and
# a pull request from someone else's copy of the repo must never have its code run here.
def test_prs_without_a_prompt_change_or_from_a_fork_are_left_alone(tmp_path):
    prs = [{"number": 8, "title": "Docs", "headRefOid": "c" * 40, "isCrossRepository": False},
           {"number": 9, "title": "Fork", "headRefOid": "d" * 40, "isCrossRepository": True}]
    shell = FakeShell(prs=prs)
    c = ctx(tmp_path, shell)
    nightly.job_score_prs(c)
    assert not shell.ran("runner/run.py") and not shell.ran("gh pr comment")
    assert not shell.ran("pull/9/head")
    assert c.night.steps[-1]["detail"].startswith("none changes")


# Why: half-scored numbers on a pull request would mislead. If the limit stopped a step, nothing is
# posted and it is tried again the next night.
def test_nothing_is_posted_when_a_step_did_not_run(tmp_path):
    prs = [{"number": 7, "title": "Tighten the prompt", "headRefOid": "b" * 40, "isCrossRepository": False}]
    shell = FakeShell(prs=prs, prints={"pr": {"monitoring_analysis": "changed", "voice_notes": "v"}},
                      runner=lambda cmd: (0, report(spent=9.8)))
    c = ctx(tmp_path, shell)
    nightly.job_score_prs(c)
    assert not shell.ran("gh pr comment")
    assert not json.loads((tmp_path / "scored-prs.json").read_text())


# Why: nearly every pull request edits docs/backlog.md, so it conflicts with main there. That must
# not stop it being scored. A conflict in the app code must, since there is no right way to settle it.
def test_conflicts_outside_the_app_take_mains_copy_and_app_conflicts_stop(tmp_path):
    shell = FakeShell(merge_code=1, conflicted="docs/backlog.md\ndocs/new.md\n",
                      checkout_fails={"docs/new.md"})
    nightly.merge_into(ctx(tmp_path, shell), tmp_path, "a" * 40, "b" * 40)
    assert ["git", "checkout", "a" * 40, "--", "docs/backlog.md"] in shell.calls
    assert ["git", "rm", "-q", "-f", "--", "docs/new.md"] in shell.calls

    shell = FakeShell(merge_code=1, conflicted="backend/app/services/x.py\n")
    with pytest.raises(RuntimeError, match="app code"):
        nightly.merge_into(ctx(tmp_path, shell), tmp_path, "a" * 40, "b" * 40)


def write_night(tmp_path, day, rep):
    out = tmp_path / day / "run" / "monitoring_analysis"
    out.mkdir(parents=True)
    (out / "report.json").write_text(json.dumps(rep))


# Why: the morning report is for Peter to read first thing. It must say what got better and worse,
# get the direction right for scores where fewer is better, and lead with it.
def test_morning_report_says_what_got_better_or_worse(tmp_path):
    write_night(tmp_path, "2026-10-19", report(found=8, extra=1))
    write_night(tmp_path, "2026-10-20", report(found=9, extra=3))
    text = nightly.morning_report(ctx(tmp_path, FakeShell()))
    top = text.split("## Monitoring analysis")[0]
    assert "Situations found: better, 9 of 10 (was 8 of 10)" in top
    assert "Triggers not in the answer key: worse, 3 (was 1)" in top
    assert "fam-new-01" in text  # the family waiting for Peter


# Why: scores from a different set of cases or runs are not comparable, and calling the difference
# "better" or "worse" would be wrong.
def test_morning_report_does_not_compare_different_samples(tmp_path):
    write_night(tmp_path, "2026-10-19", report(found=5, families=2))
    write_night(tmp_path, "2026-10-20", report(found=9))
    text = nightly.morning_report(ctx(tmp_path, FakeShell()))
    assert "the sample was different then" in text
    assert "better" not in text and "worse" not in text


# Why: the Sunday job's spend counts against the night, and the families it wrote are listed.
def test_generate_records_its_spend_and_families(tmp_path):
    c = ctx(tmp_path, FakeShell())
    nightly.job_generate(c)
    assert c.night.spent() == 1.25
    assert c.night.steps[0]["written"] == ["fam-new-01"]
