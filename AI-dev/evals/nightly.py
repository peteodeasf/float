"""The overnight schedule for the AI tests. Started by nightly.sh beside this file, which cron runs.

    AI-dev/evals/nightly.sh <job> [--dry-run] [--update]

The jobs, from docs/plans/ai-quality-testing.md, "The schedule":

  generate   Sundays 1am. New made-up families into the waiting pool. They are not tested until
             Peter accepts them, so the scores stay comparable from night to night.
  run        Nightly 2am. Each feature the runner has, on the fixed cases, then the held-out scores.
  score-prs  Nightly 4am. Each open pull request that changes a tested prompt or model, scored on
             the same cases, with the scores posted on the pull request.
  report     Daily 6am. A short report for Peter in ~/eval-reports/<date>.md.
  all        The four in order.

The night has one spending limit, shared by every job. It is checked before each step, and each
step is given only what is left, so the night cannot go over it.

--dry-run calls no AI, posts nothing and spends nothing. It does everything else and writes the
report, saying what would have run.

Made-up cases and the local test database only. Nothing here reads a database, and the script
refuses to start if DATABASE_URL points anywhere but the local test database.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "runner"))

from cases import half  # noqa: E402

REL = "AI-dev/evals"
POOL_REL = f"{REL}/pool/families"
# The features the runner has (`FEATURES` in runner/run.py). A test keeps the two lists the same.
FEATURES = ("monitoring_analysis", "voice_notes", "rungs", "step_sentences")
FEATURE_TEXT = {"monitoring_analysis": "Monitoring analysis", "voice_notes": "Voice notes",
                "rungs": "Suggested rungs", "step_sentences": "Step sentences"}

DEFAULT_LIMIT = 10.0
DEFAULT_RUNS = 3
GENERATE_COUNT = 5
# A step is not started with less than this left: it could not get through enough cases to say
# anything.
MIN_TO_START = 0.50
STEP_TIMEOUT = 3 * 60 * 60

LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
TEST_DATABASE = "float_test"

# For the morning report's "better" and "worse". Every other score is better when lower.
HIGHER_IS_BETTER = {"situations_found", "types_right", "count_right", "fear_kept", "note_words_kept"}

# Trevor's face at the top of the morning report, so Peter sees how the night went before reading.
# Picked by `night_mood`; the pictures are in trevor/ beside this file.
TREVOR = Path(__file__).resolve().parent / "trevor"
MOOD_TEXT = {
    "cross": "something failed, stopped early or got worse",
    "cheering": "a score got better and nothing got worse",
    "pleased": "everything ran and the scores held",
    "unimpressed": "not much to go on tonight",
}

NOT_TESTED = [
    "Step sentences and suggested rungs are not run yet. They need the reviewing agents, a later item.",
    "There are no reviewing agents yet, so there are no reviewer disagreements to report.",
    "The risk flag is not scored. What counts as a risk sign is a question for Dr. Walker.",
]


# --- Running commands -------------------------------------------------------------------------

def sh(cmd, cwd: Path, timeout: int = STEP_TIMEOUT) -> subprocess.CompletedProcess:
    return subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True,
                          timeout=timeout)


def last_line(text: str) -> str:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1][:300] if lines else ""


def check_database(env) -> str | None:
    """Why the night must not start, or None. Only the local test database is allowed."""
    url = env.get("DATABASE_URL")
    if not url:
        return None
    parts = urlsplit(url)
    host, name = parts.hostname, parts.path.lstrip("/")
    if host not in LOCAL_HOSTS or name != TEST_DATABASE:
        return (f"DATABASE_URL points at database {name!r} on {host!r}. The AI tests may only use "
                f"the local test database ({TEST_DATABASE} on localhost). Nothing was run.")
    return None


# --- The night's record -----------------------------------------------------------------------

class Night:
    """One night's folder and what was spent in it. Every job writes a line for each step, so the
    morning report can say what ran, what was skipped and why."""

    def __init__(self, reports: Path, day: date, limit: float, dry_run: bool = False):
        self.reports = reports
        self.day = day
        self.dir = reports / (("dry-run-" if dry_run else "") + day.isoformat())
        self.path = self.dir / "ledger.json"
        self.dry_run = dry_run
        if self.path.exists():
            data = json.loads(self.path.read_text())
        else:
            data = {"date": day.isoformat(), "limit_usd": limit, "steps": []}
        # The limit is set by the night's first job, so a later job cannot raise it.
        self.limit = float(data["limit_usd"])
        self.steps: list[dict] = data["steps"]
        # Set by `morning_report`: one of MOOD_TEXT's keys.
        self.mood: str | None = None

    def spent(self) -> float:
        return round(sum(s["spent_usd"] for s in self.steps), 4)

    def left(self) -> float:
        return max(0.0, round(self.limit - self.spent(), 4))

    def add(self, job: str, step: str, status: str, spent: float = 0.0, detail: str = "",
            **extra) -> dict:
        row = {"job": job, "step": step, "status": status, "spent_usd": round(spent, 4),
               "detail": detail, "at": datetime.now().strftime("%H:%M"), **extra}
        self.steps.append(row)
        self.save()
        return row

    def save(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"date": self.day.isoformat(), "limit_usd": self.limit,
                                         "steps": self.steps}, indent=2) + "\n")


@dataclass
class Ctx:
    checkout: Path
    night: Night
    runs: int = DEFAULT_RUNS
    count: int = GENERATE_COUNT
    python: str = sys.executable
    sh: callable = sh
    notes: list[str] = field(default_factory=list)

    @property
    def dry_run(self) -> bool:
        return self.night.dry_run


def git(ctx: Ctx, *args, cwd: Path | None = None) -> str:
    p = ctx.sh(["git", *args], cwd=cwd or ctx.checkout)
    if p.returncode != 0:
        raise RuntimeError(f"git {args[0]} failed: {last_line(p.stderr)}")
    return p.stdout


def fixed_families(ctx: Ctx, checkout: Path | None = None) -> list[str]:
    """The working half of the families committed to the pool. A family the generator wrote and
    nobody has committed is left out, so a new Sunday family does not change Monday's sample."""
    out = git(ctx, "ls-files", POOL_REL, cwd=checkout)
    ids = sorted(Path(p).stem for p in out.split() if p.endswith(".json"))
    return [i for i in ids if half(i) == "working"]


def waiting_families(ctx: Ctx) -> list[str]:
    """Families in the pool folder that are not committed: written by the generator, not yet
    looked at."""
    out = git(ctx, "ls-files", "--others", "--exclude-standard", POOL_REL)
    return sorted(Path(p).stem for p in out.split() if p.endswith(".json"))


# --- One step ---------------------------------------------------------------------------------

def _allowance(ctx: Ctx, job: str, step: str) -> float | None:
    left = ctx.night.left()
    if left < MIN_TO_START:
        ctx.night.add(job, step, "skipped",
                      detail=f"only ${left:.2f} of tonight's ${ctx.night.limit:.2f} limit was left")
        return None
    return left


def _failed(ctx: Ctx, job: str, step: str, p, allowance: float) -> None:
    # Exit code 2 is the scripts' "ANTHROPIC_API_KEY is not set. Nothing was run." Any other failure
    # may have spent money before it stopped, and the amount is not known, so the whole allowance is
    # counted. That stops the rest of the night rather than risk going over the limit.
    nothing_spent = p.returncode == 2
    ctx.night.add(job, step, "failed", 0.0 if nothing_spent else allowance,
                  detail=(last_line(p.stderr) or last_line(p.stdout) or f"exit code {p.returncode}")
                  + ("" if nothing_spent else " (what it spent is not known, so all it was allowed is "
                                              "counted)"))


def run_feature(ctx: Ctx, job: str, feature: str, families: list[str], out: Path,
                checkout: Path | None = None, label: str = "") -> dict | None:
    """The runner on the fixed families. Returns its report, or None if it did not run."""
    checkout = checkout or ctx.checkout
    step = f"{label}{feature}"
    allowance = _allowance(ctx, job, step)
    if allowance is None:
        return None
    cmd = [ctx.python, checkout / REL / "runner" / "run.py", "--feature", feature,
           "--families", ",".join(families), "--runs", ctx.runs, "--budget", f"{allowance:.2f}",
           "--out", out]
    if ctx.dry_run:
        ctx.night.add(job, step, "dry run",
                      detail=f"would run {feature} on {len(families)} families, {ctx.runs} runs each, "
                             f"with up to ${allowance:.2f}")
        return None
    report = out / "report.json"
    report.unlink(missing_ok=True)  # an earlier run tonight must not pass for this one
    p = ctx.sh(cmd, cwd=checkout)
    out.mkdir(parents=True, exist_ok=True)
    (out / "log.txt").write_text(p.stdout + p.stderr)
    if p.returncode != 0 or not report.exists():
        _failed(ctx, job, step, p, allowance)
        return None
    rep = json.loads(report.read_text())
    ctx.night.add(job, step, "ran", rep["spent_usd"], detail=rep["stopped"] or "",
                  report=str(report))
    return rep


SPENT = re.compile(r"Spent \$([0-9.]+)")


def run_held_out(ctx: Ctx, job: str, feature: str, out: Path, checkout: Path | None = None,
                 label: str = "") -> dict | None:
    """judging/run_held_out.py, which prints scores only. Returns its report, {"none": True} when
    there are no held-out cases, or None if it did not run."""
    checkout = checkout or ctx.checkout
    step = f"{label}held-out {feature}"
    allowance = _allowance(ctx, job, step)
    if allowance is None:
        return None
    cmd = [ctx.python, checkout / REL / "judging" / "run_held_out.py", "--feature", feature,
           "--runs", ctx.runs, "--budget", f"{allowance:.2f}", "--json"]
    if ctx.dry_run:
        ctx.night.add(job, step, "dry run", detail=f"would score the held-out cases, up to ${allowance:.2f}")
        return None
    p = ctx.sh(cmd, cwd=checkout)
    if p.returncode == 1 and SPENT.search(p.stderr or ""):
        # It failed part-way and said what it spent. It prints the error's type only.
        ctx.night.add(job, step, "failed", float(SPENT.search(p.stderr).group(1)),
                      detail=last_line(p.stderr))
        return None
    if p.returncode != 0:
        _failed(ctx, job, step, p, allowance)
        return None
    if p.stdout.startswith("No held-out cases"):
        ctx.night.add(job, step, "ran", detail="no held-out cases yet")
        return {"none": True}
    rep = json.loads(p.stdout)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=2) + "\n")
    ctx.night.add(job, step, "ran", rep["spent_usd"], detail=rep["stopped"] or "", report=str(out))
    return rep


# --- The jobs ---------------------------------------------------------------------------------

def job_generate(ctx: Ctx) -> None:
    step = f"{ctx.count} new families"
    allowance = _allowance(ctx, "generate", step)
    if allowance is None:
        return
    summary = ctx.night.dir / "generate.json"
    cmd = [ctx.python, ctx.checkout / REL / "generator" / "generate.py", "--count", ctx.count,
           "--budget", f"{allowance:.2f}", "--summary-json", summary]
    if ctx.dry_run:
        ctx.night.add("generate", step, "dry run",
                      detail=f"would write {ctx.count} families into the waiting pool, with up to ${allowance:.2f}")
        return
    ctx.night.dir.mkdir(parents=True, exist_ok=True)
    # A crash also exits with 1, and leaves no summary. An earlier run's summary must not stand in.
    summary.unlink(missing_ok=True)
    p = ctx.sh(cmd, cwd=ctx.checkout)
    (ctx.night.dir / "generate-log.txt").write_text(p.stdout + p.stderr)
    # Exit code 1 means some families failed their checks, which the summary says. It is not a crash.
    if p.returncode not in (0, 1) or not summary.exists():
        _failed(ctx, "generate", step, p, allowance)
        return
    data = json.loads(summary.read_text())
    ctx.night.add("generate", step, "ran", data["spent_usd"],
                  detail=f"wrote {len(data['written'])}, {len(data['failed'])} failed their checks"
                         + (f"; {data['stopped']}" if data["stopped"] else ""),
                  written=data["written"])


def job_run(ctx: Ctx) -> None:
    families = fixed_families(ctx)
    for feature in FEATURES:
        run_feature(ctx, "run", feature, families, ctx.night.dir / "run" / feature)
        run_held_out(ctx, "run", feature, ctx.night.dir / "held_out" / f"{feature}.json")


def fingerprint(checkout: Path | None = None) -> dict[str, str]:
    """For each feature, a short hash of the model and the prompt the app sends. Two checkouts with
    the same fingerprint test the same thing. Called in a subprocess: it imports the app."""
    import app_code  # noqa: F401  # makes backend/app importable
    import monitoring_analysis
    import rungs
    import step_sentences
    import voice_notes
    out = {}
    for f in (monitoring_analysis, voice_notes, rungs, step_sentences):
        out[f.NAME] = hashlib.sha256(f"{f.model()}\n{f.app_prompt()}".encode()).hexdigest()[:12]
    return out


def _fingerprint_of(ctx: Ctx, checkout: Path) -> dict[str, str]:
    p = ctx.sh([ctx.python, checkout / REL / "nightly.py", "fingerprint"], cwd=checkout, timeout=300)
    if p.returncode != 0:
        raise RuntimeError(f"could not read its prompts: {last_line(p.stderr)}")
    return json.loads(p.stdout)


def open_prs(ctx: Ctx) -> list[dict]:
    p = ctx.sh(["gh", "pr", "list", "--state", "open", "--limit", "50", "--json",
                "number,title,headRefOid,isCrossRepository"], cwd=ctx.checkout, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(f"could not list the open pull requests: {last_line(p.stderr)}")
    return json.loads(p.stdout)


def job_score_prs(ctx: Ctx) -> None:
    state_path = ctx.night.reports / "scored-prs.json"
    scored = json.loads(state_path.read_text()) if state_path.exists() else {}
    try:
        prs = open_prs(ctx)
        base = git(ctx, "rev-parse", "HEAD").strip()
        main_print = _fingerprint_of(ctx, ctx.checkout)
    except RuntimeError as e:
        ctx.night.add("score-prs", "open pull requests", "failed", detail=str(e))
        return
    families = fixed_families(ctx)
    found = 0
    for pr in prs:
        n, sha = pr["number"], pr["headRefOid"]
        if pr["isCrossRepository"]:
            continue  # someone else's copy of the repo: its code is not run here
        if scored.get(str(n)) == sha:
            continue  # scored already at this commit
        result = score_pr(ctx, pr, base, main_print, families)
        if result == "no change":
            if not ctx.dry_run:
                scored[str(n)] = sha
            continue
        found += 1
        if result == "done" and not ctx.dry_run:
            scored[str(n)] = sha
    if not found:
        ctx.night.add("score-prs", "open pull requests", "ran",
                      detail="none changes a tested prompt or model since it was last scored")
    if not ctx.dry_run:
        ctx.night.reports.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(scored, indent=2) + "\n")


def merge_into(ctx: Ctx, wt: Path, base: str, sha: str) -> None:
    """Merge `sha` into the worktree at `base`, without committing. A conflict outside backend/
    (nearly always docs/backlog.md, which most pull requests edit) is settled by taking main's copy:
    only the app code is being tested. A conflict in backend/ cannot be settled, and is raised."""
    p = ctx.sh(["git", "merge", "-q", "--no-commit", "--no-ff", sha], cwd=wt)
    if p.returncode == 0:
        return
    conflicted = git(ctx, "diff", "--name-only", "--diff-filter=U", cwd=wt).split()
    in_app = [f for f in conflicted if f.startswith("backend/")]
    if in_app:
        raise RuntimeError(f"it conflicts with main in the app code ({', '.join(in_app[:3])}), "
                           f"so it could not be merged to test")
    if not conflicted:
        raise RuntimeError(f"it could not be merged with main: {last_line(p.stderr)}")
    for f in conflicted:
        if ctx.sh(["git", "checkout", base, "--", f], cwd=wt).returncode != 0:
            git(ctx, "rm", "-q", "-f", "--", f, cwd=wt)  # not on main: the pull request added it


def score_pr(ctx: Ctx, pr: dict, base: str, main_print: dict, families: list[str]) -> str:
    """Score one pull request. Returns "no change" when it changes no tested prompt or model,
    "done" when it was scored and posted, or "incomplete"."""
    n, sha = pr["number"], pr["headRefOid"]
    step = f"#{n}"
    wt = Path(tempfile.mkdtemp(prefix=f"float-pr-{n}-"))
    wt.rmdir()
    try:
        # The pull request merged into main, without committing: what main would be if it merged.
        # A pull request that is behind main would otherwise fail on code main's tests rely on.
        # GitHub's own trial merge (pull/N/merge) is not used: it is only remade when someone looks
        # at the pull request, so it can be days behind main.
        git(ctx, "fetch", "-q", "origin", f"pull/{n}/head")
        git(ctx, "worktree", "add", "-q", "--detach", str(wt), base)
        merge_into(ctx, wt, base, sha)
        # The scoring code and the cases come from main, not from the pull request, so a pull
        # request cannot change how it is marked. Only its app code (backend/) is its own.
        shutil.rmtree(wt / REL, ignore_errors=True)
        git(ctx, "checkout", base, "--", REL, cwd=wt)
        pr_print = _fingerprint_of(ctx, wt)
        changed = [f for f in FEATURES if pr_print.get(f) != main_print.get(f)]
        if not changed:
            return "no change"
        reps = {}
        for feature in changed:
            out = ctx.night.dir / f"pr-{n}"
            reps[feature] = (
                run_feature(ctx, "score-prs", feature, families, out / feature, checkout=wt,
                            label=f"#{n} "),
                run_held_out(ctx, "score-prs", feature, out / f"held_out-{feature}.json",
                             checkout=wt, label=f"#{n} "),
            )
        if ctx.dry_run:
            return "incomplete"
        if any(r is None for pair in reps.values() for r in pair):
            ctx.night.add("score-prs", step, "incomplete", pr=n, title=pr["title"],
                          detail="not every step ran, so nothing was posted. It is tried again next night.")
            return "incomplete"
        body = pr_comment(ctx, pr, base, reps)
        path = ctx.night.dir / f"pr-{n}.md"
        path.write_text(body)
        p = ctx.sh(["gh", "pr", "comment", str(n), "--body-file", path], cwd=ctx.checkout, timeout=120)
        if p.returncode != 0:
            ctx.night.add("score-prs", step, "failed", pr=n, title=pr["title"],
                          detail=f"scored, but posting failed: {last_line(p.stderr)}")
            return "incomplete"
        ctx.night.add("score-prs", step, "posted", pr=n, title=pr["title"],
                      detail=", ".join(FEATURE_TEXT[f] for f in changed) + " changed")
        return "done"
    except RuntimeError as e:
        ctx.night.add("score-prs", step, "failed", pr=n, title=pr["title"], detail=str(e))
        return "incomplete"
    finally:
        if wt.exists():
            ctx.sh(["git", "worktree", "remove", "--force", str(wt)], cwd=ctx.checkout)


# --- Words for Peter --------------------------------------------------------------------------

def _ratio(totals: dict, key: str, out_of: str | None) -> str:
    if not out_of:
        return str(totals[key])
    a, b = totals[key], totals[out_of]
    return f"{a} of {b}" if b else f"{a} of 0"


def _share(totals: dict, key: str, out_of: str | None) -> float | None:
    if not out_of:
        return float(totals[key])
    return totals[key] / totals[out_of] if totals[out_of] else None


def same_sample(a: dict, b: dict) -> bool:
    return all(a.get(k) == b.get(k) for k in ("families_run", "cases_run", "runs", "runs_per_case"))


def direction(key: str, before: float | None, after: float | None) -> str:
    if before is None or after is None or abs(before - after) < 1e-9:
        return "same"
    up = after > before
    return "better" if up == (key in HIGHER_IS_BETTER) else "worse"


def pr_comment(ctx: Ctx, pr: dict, base: str, reps: dict) -> str:
    lines = [
        "## AI test scores",
        "",
        f"Scored overnight on {ctx.night.day.isoformat()} by `AI-dev/evals/nightly.sh`. This pull "
        f"request at `{pr['headRefOid'][:7]}`, as GitHub would merge it into main, against main "
        f"at `{base[:7]}`.",
        "",
        "The cases and the scoring code came from main, so this pull request cannot change how it is "
        "marked. Made-up cases only.",
    ]
    for feature, (rep, held) in reps.items():
        main_path = ctx.night.dir / "run" / feature / "report.json"
        main = json.loads(main_path.read_text()) if main_path.exists() else None
        lines += ["", f"### {FEATURE_TEXT[feature]}: the prompt or model changed", ""]
        lines.append(f"{rep['cases_run']} cases from {rep['families_run']} families, "
                     f"{rep['runs_per_case']} runs each ({rep['runs_scored']} runs the app could read).")
        if main and not same_sample(main, rep):
            main = None
            lines.append("Main's run tonight used a different sample, so it is not shown.")
        elif not main:
            lines.append("Main was not run tonight, so there is nothing to compare with.")
        lines += ["", "| Score | Main | This pull request |", "|---|---|---|"]
        for label, key, out_of in rep["scores"]:
            before = _ratio(main["totals"], key, out_of) if main else "–"
            lines.append(f"| {label} | {before} | {_ratio(rep['totals'], key, out_of)} |")
        s = rep["stability"]
        ms = main["stability"] if main else None
        lines.append(f"| How often runs of one case agree | {_mean(ms)} | {_mean(s)} |")
        lines += ["", _held_out_line(held)]
        if rep["stopped"]:
            lines.append(f"Stopped early: {rep['stopped']}.")
    lines += [
        "",
        "These are small numbers. A change of one or two can come from the AI answering differently "
        "from one run to the next, not from the change. The full counts are in the runner's report.",
        "",
        f"Spent on this pull request tonight: ${sum(r[0]['spent_usd'] + r[1].get('spent_usd', 0) for r in reps.values()):.2f}.",
    ]
    return "\n".join(lines) + "\n"


def _mean(stability: dict | None) -> str:
    return "–" if not stability or stability["mean"] is None else f"{stability['mean']:.2f}"


def _held_out_line(held: dict | None) -> str:
    if held is None:
        return "Held-out cases: not run."
    if held.get("none"):
        return "Held-out cases: none yet."
    s = held["stability"]
    parts = [f"{label} {_ratio(held['totals'], key, out_of)}" for label, key, out_of in held["scores"]
             if out_of][:3]
    return (f"Held-out cases (scores only, {held['cases_run']} cases, {held['runs']} runs): "
            + "; ".join(parts) + (f"; runs agree {s['mean']:.2f}" if s["mean"] is not None else "") + ".")


def questions_for_peter(ctx: Ctx) -> list[dict] | None:
    """Open issues labelled needs-peter: the agent loop's questions it would not guess at
    (docs/plans/agent-loop.md). Each with the newest comment, which is the question. None if GitHub
    could not be read."""
    p = ctx.sh(["gh", "issue", "list", "--label", "needs-peter", "--state", "open", "--limit", "30",
                "--json", "number,title,url,comments"], cwd=ctx.checkout, timeout=120)
    if p.returncode != 0:
        return None
    out = []
    for issue in json.loads(p.stdout or "[]"):
        comments = issue.get("comments") or []
        question = " ".join((comments[-1].get("body") or "").split()) if comments else ""
        if len(question) > 300:
            question = question[:297].rstrip() + "..."
        out.append({"number": issue["number"], "title": issue["title"], "url": issue["url"],
                    "question": question})
    return sorted(out, key=lambda q: q["number"])


def previous_night(reports: Path, day: date) -> Path | None:
    """The latest earlier night with a run report, for "better or worse"."""
    nights = sorted(p for p in reports.glob("20*-*-*") if p.is_dir() and p.name < day.isoformat()
                    and any((p / "run").glob("*/report.json")))
    return nights[-1] if nights else None


def _status_line(s: dict) -> str:
    money = f", ${s['spent_usd']:.2f}" if s["spent_usd"] else ""
    detail = f": {s['detail']}" if s["detail"] else ""
    return f"- {s['job']}, {s['step']}: {s['status']}{money}{detail}"


def night_mood(dry_run: bool, trouble: bool, better: int, worse: int, all_ran: bool) -> str:
    """Which Trevor goes on the report. Bad news wins over good, so a night where one score went up
    and another went down shows the cross face."""
    if dry_run:
        return "unimpressed"
    if trouble or worse:
        return "cross"
    if better:
        return "cheering"
    if all_ran:
        return "pleased"
    return "unimpressed"


def morning_report(ctx: Ctx) -> str:
    night = ctx.night
    prev = previous_night(night.reports, night.day)
    title = f"# AI tests, night of {night.day.isoformat()}"
    lines = [title + (" (dry run)" if night.dry_run else ""), ""]
    if night.dry_run:
        lines += ["**Dry run.** No AI was called, nothing was posted and nothing was spent. It shows "
                  "what each job would have done.", ""]
    lines.append(f"Spent ${night.spent():.2f} of the ${night.limit:.2f} limit for the night.")

    body: list[str] = []
    changes: list[str] = []
    compared = False
    better = worse = 0
    all_ran = True
    trouble = any(s["status"] == "failed" for s in night.steps)
    for feature in FEATURES:
        name = FEATURE_TEXT[feature]
        path = night.dir / "run" / feature / "report.json"
        body += ["", f"## {name}", ""]
        if not path.exists():
            body.append("Not run tonight. See \"What ran\" below.")
            all_ran = False
            continue
        rep = json.loads(path.read_text())
        n = rep["runs_per_case"]
        body.append(f"{rep['cases_run']} cases from {rep['families_run']} families, "
                    f"{n} run{'' if n == 1 else 's'} each. {rep['runs_scored']} of {rep['runs']} runs "
                    f"gave an answer the app could read.")
        old_path = prev / "run" / feature / "report.json" if prev else None
        old = json.loads(old_path.read_text()) if old_path and old_path.exists() else None
        if old and not same_sample(old, rep):
            body.append(f"Not compared with {prev.name}: the sample was different then.")
            old = None
        elif not old:
            body.append("No earlier night to compare with.")
        else:
            compared = True
            if old["prompt_sha256"] == rep["prompt_sha256"]:
                body.append(f"Compared with {prev.name}. The prompt is the same.")
            else:
                body.append(f"Compared with {prev.name}. **The prompt changed since then.**")
                changes.append(f"{name}: the prompt changed.")
        body.append("")
        for label, key, out_of in rep["scores"]:
            now = _ratio(rep["totals"], key, out_of)
            d = direction(key, _share(old["totals"], key, out_of),
                          _share(rep["totals"], key, out_of)) if old else "same"
            if d == "same":
                body.append(f"- {label}: {now}")
            else:
                then = _ratio(old["totals"], key, out_of)
                body.append(f"- {label}: {now}, was {then} ({d})")
                changes.append(f"{name}, {label.lstrip('. ')}: {d}, {now} (was {then}).")
                better += d == "better"
                worse += d == "worse"
        if n < 2:
            body.append("- With one run each, whether runs agree cannot be measured.")
        else:
            unsteady = [c["case"] for c in rep["per_case"]
                        if c["stability"] is not None and c["stability"] < 1]
            body.append(f"- Cases where the runs did not all agree: {len(unsteady)} of "
                        f"{rep['stability']['cases']}.")
            if old and old["runs_per_case"] > 1:
                was_steady = {c["case"] for c in old["per_case"] if c["stability"] == 1}
                new = [c for c in unsteady if c in was_steady]
                if new:
                    worse += 1
                    body.append(f"- New tonight (all runs agreed last time): {', '.join(new)}.")
                    changes.append(f"{name}: runs now disagree on {len(new)} case"
                                   f"{'' if len(new) == 1 else 's'} where they agreed last time.")
        if rep["stopped"]:
            body.append(f"- Stopped early: {rep['stopped']}.")
            trouble = True
        held_path = night.dir / "held_out" / f"{feature}.json"
        held = json.loads(held_path.read_text()) if held_path.exists() else None
        if held is None and any(st["step"] == f"held-out {feature}" and st["detail"] == "no held-out cases yet"
                                for st in night.steps):
            held = {"none": True}
        body.append(f"- {_held_out_line(held)}")

    night.mood = night_mood(night.dry_run, trouble, better, worse, all_ran)
    lines[2:2] = [f"![Trevor: {MOOD_TEXT[night.mood]}]({night.dir.name}-trevor.webp)", ""]

    if changes:
        lines += ["", f"**Since {prev.name}:**", ""] + [f"- {c}" for c in changes]
        lines += ["", "Small numbers: a change of one or two can come from the AI answering "
                      "differently from run to run, not from a change to Float."]
    elif compared:
        lines += ["", f"No score changed since {prev.name}."]

    # Peter, 2026-10-21: the loop's questions go in the report as a reminder, near the top.
    questions = questions_for_peter(ctx)
    lines += ["", "## Questions for you", ""]
    if questions is None:
        lines.append("Could not read the issues list from GitHub tonight.")
    elif not questions:
        lines.append("None waiting.")
    else:
        lines.append(f"{len(questions)} issue{'' if len(questions) == 1 else 's'} labelled `needs-peter`. "
                     "Answer on the issue and remove the label; the loop picks it up the next night.")
        lines.append("")
        for q in questions:
            ask = f": {q['question']}" if q["question"] else ""
            lines.append(f"- [#{q['number']} {q['title']}]({q['url']}){ask}")
    lines += body

    prs = [s for s in night.steps if s["job"] == "score-prs" and s.get("pr")]
    lines += ["", "## Pull requests scored", ""]
    if prs:
        for s in prs:
            lines.append(f"- #{s['pr']} {s.get('title', '')}: {s['status']}. {s['detail']}".rstrip())
    elif any(s["job"] == "score-prs" for s in night.steps):
        lines.append("None open that change a tested prompt or model.")
    else:
        lines.append("Not run tonight.")

    waiting = waiting_families(ctx)
    gen = [s for s in night.steps if s["job"] == "generate"]
    lines += ["", "## New made-up families", ""]
    for s in gen:
        lines.append(f"- Tonight: {s['status']}. {s['detail']}".rstrip())
    if waiting:
        lines.append(f"- {len(waiting)} in the waiting pool, not yet in the tests: {', '.join(waiting)}. "
                     f"They join when you accept them. To read them: "
                     f"`python3 -I AI-dev/evals/pool/viewer.py families.html`.")
    elif not gen:
        lines.append("None waiting.")

    lines += ["", "## What ran", ""]
    lines += [_status_line(s) for s in night.steps] or ["Nothing."]
    lines += ["", "## Not tested yet", ""] + [f"- {n}" for n in NOT_TESTED]
    return "\n".join(lines) + "\n"


def job_report(ctx: Ctx) -> Path:
    text = morning_report(ctx)
    path = ctx.night.reports / f"{ctx.night.dir.name}.md"
    ctx.night.reports.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    # The picture sits beside the report, so the report's link works wherever the folder is read.
    shutil.copyfile(TREVOR / f"{ctx.night.mood}.webp", ctx.night.reports / f"{ctx.night.dir.name}-trevor.webp")
    return path


JOBS = {"generate": job_generate, "run": job_run, "score-prs": job_score_prs, "report": job_report}


def main(argv=None, env=None, today: date | None = None, run=sh) -> int:
    env = os.environ if env is None else env
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("job", choices=[*JOBS, "all", "fingerprint"])
    p.add_argument("--dry-run", action="store_true", help="call no AI, post nothing, spend nothing")
    p.add_argument("--reports", type=Path, default=Path(env.get("FLOAT_EVAL_REPORTS",
                                                                 Path.home() / "eval-reports")))
    p.add_argument("--limit", type=float, default=float(env.get("FLOAT_EVAL_NIGHTLY_LIMIT", DEFAULT_LIMIT)),
                   help=f"dollars for the whole night (default {DEFAULT_LIMIT:.0f})")
    p.add_argument("--runs", type=int, default=int(env.get("FLOAT_EVAL_RUNS", DEFAULT_RUNS)))
    p.add_argument("--count", type=int, default=GENERATE_COUNT, help="families for the generate job")
    a = p.parse_args(argv)

    if a.job == "fingerprint":
        print(json.dumps(fingerprint()))
        return 0
    refused = check_database(env)
    if refused:
        print(refused, file=sys.stderr)
        return 2

    a.reports.mkdir(parents=True, exist_ok=True)
    with open(a.reports / ".lock", "w") as lock:
        # One job at a time. If the 2am run is still going at 4am, the PR scoring waits for it.
        fcntl.flock(lock, fcntl.LOCK_EX)
        ctx = Ctx(checkout=ROOT, night=Night(a.reports, today or date.today(), a.limit, a.dry_run),
                  runs=a.runs, count=a.count, sh=run)
        for name in (list(JOBS) if a.job == "all" else [a.job]):
            result = JOBS[name](ctx)
            if name == "report":
                print(f"Wrote {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
