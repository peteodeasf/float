"""Do the two monitoring prompts add triggers the parent never logged? Counts for each.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/runner/compare_triggers.py --runs 3 --budget 9

The two prompts disagree. The preliminary report prompt (PRELIMINARY_REPORT_SYSTEM_PROMPT in
backend/app/api/routers/patients.py) says of triggers the parent didn't log, "you may add them". The
extraction prompt (EXTRACTION_SYSTEM_PROMPT) forbids it. This changes neither prompt. It runs Analyze
with AI the way the route does, on the working half of the pool, and counts what each one adds.

For each family and each run:
  1. The extraction call, the app's own (insight_service.request_extraction).
  2. The list folded in as a first analysis, with the preliminary report test tool's stand-in for an
     empty database (backend/evals/preliminary_report/app_pipeline.py). The extraction's situations
     are counted as a clinician sees them: one per name after the app's normalise_name.
  3. The report call, the app's own (insight_service.request_report), given that list and the log.
  4. A matcher on a different model reads each list against the numbered log and says, for every
     situation, which entries describe it, and any trigger in its name that no entry describes. It is
     not told which prompt wrote the list. One call per list.

Why a matcher: the report's situations carry no entry numbers, so the runner's matching by entry
(monitoring_analysis.py) has nothing to go on. The matcher gives both lists entry numbers the same
way, so the two counts are made alike. Its answers are a model's reading and no person has checked
them; the report says so.

A situation is matched to the answer key the way the runner does it: through the entries it is about,
to the fact situation most of them belong to (`situation_ref`).

Writes AI-dev/evals/runner/runs/<timestamp>-triggers/ (not committed): report.md and report.json
with counts only, and outputs.jsonl with the models' answers for reading by hand.
Needs ANTHROPIC_API_KEY. Touches no database.
"""
import argparse
import asyncio
import dataclasses
import importlib.util
import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import app_code  # noqa: E402
import monitoring_analysis as ma  # noqa: E402
from budget import Budget, BudgetExceeded, MeteredClient  # noqa: E402
from cases import load_cases  # noqa: E402
from engine import stability  # noqa: E402

# Not the model either prompt runs on (claude-sonnet-4-6), so it is not marking its own kind of work.
MATCHER_MODEL = "claude-opus-5-5"
MATCHER_MAX_TOKENS = 2000

# Generic instructions only. The log and the list arrive in the user message at run time; no case
# text belongs here (docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).
MATCHER_PROMPT = """You check a list of trigger situations against the parent's monitoring log it was written from.

The log is a set of numbered entries. Each describes one moment a parent saw their child anxious.

For each numbered situation in the list:
- "entries": the numbers of every log entry that describes a moment of this situation. A situation
  that groups several logged moments under one broader theme covers all of them. Use [] only when no
  entry describes the situation at all.
- "not_in_log": any trigger named in the situation, in its main words or in brackets, that no log
  entry describes. Write each one as a short phrase from the situation's name. A different wording,
  a broader theme for triggers that were logged, or a clinical name for a logged trigger is not new.
  Use [] when everything named was logged.

Judge only what the log says happened. Do not judge whether the situation is clinically reasonable.

Return ONLY valid JSON, no markdown fences, no other text:
{"situations": [{"n": 1, "entries": [3, 7], "not_in_log": []}]}
"""

LISTS = ("extraction", "report")

SUMMED = ("situations", "added", "added_parts", "linked", "split")


def _app_pipeline():
    """backend/evals/preliminary_report/app_pipeline.py, which folds the list in exactly as the route
    does for a first analysis. Loaded by path: backend/evals is not a package."""
    key = "preliminary_report_app_pipeline"
    if key not in sys.modules:
        path = app_code.BACKEND / "evals" / "preliminary_report" / "app_pipeline.py"
        spec = importlib.util.spec_from_file_location(key, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[key] = module
        spec.loader.exec_module(module)
    return sys.modules[key]


def in_date_order(case):
    """The case with its log in date order, as the route reads it (`order_by(entry_date)`), with the
    answer key's entry refs kept beside their entries. A stable sort, so same-day entries keep their
    order."""
    pairs = sorted(zip(case.input["monitoring_log"], case.expected["entry_refs"]), key=lambda p: p[0]["date"])
    return dataclasses.replace(
        case,
        input={**case.input, "monitoring_log": [e for e, _ in pairs]},
        expected={**case.expected, "entry_refs": [r for _, r in pairs]},
    )


def matcher_input(entries_text: str, names: list[str]) -> str:
    listed = "\n".join(f"{n}. {name}" for n, name in enumerate(names, 1))
    return f"The monitoring log:\n\n{entries_text}\n\nThe list:\n\n{listed}"


def request_match(client, entries_text: str, names: list[str]) -> str:
    message = client.messages.create(
        model=MATCHER_MODEL,
        max_tokens=MATCHER_MAX_TOKENS,
        system=MATCHER_PROMPT,
        messages=[{"role": "user", "content": matcher_input(entries_text, names)}],
    )
    # This model may think before it answers, so the reply can start with a thinking block.
    return "".join(b.text for b in message.content if getattr(b, "type", "text") == "text")


def read_match(raw: str, count: int, entry_count: int) -> list[dict] | None:
    """One {"entries", "not_in_log"} per situation, in list order, or None if the reply can't be read
    or doesn't answer for every situation. Entry numbers outside the log are dropped, as the app's
    entry_ids_by_situation drops them."""
    from app.services.insight_service import parse_model_json
    try:
        parsed = parse_model_json(raw)
    except Exception:
        return None
    by_n = {}
    for s in (parsed.get("situations") if isinstance(parsed, dict) else None) or []:
        try:
            n = int(s.get("n"))
        except (TypeError, ValueError, AttributeError):
            continue
        entries = []
        for e in s.get("entries") or []:
            try:
                e = int(e)
            except (TypeError, ValueError):
                continue
            if 1 <= e <= entry_count and e not in entries:
                entries.append(e)
        by_n[n] = {"entries": entries, "not_in_log": [str(p) for p in s.get("not_in_log") or [] if p]}
    if any(n not in by_n for n in range(1, count + 1)):
        return None
    return [by_n[n] for n in range(1, count + 1)]


def score_list(match: list[dict], entry_refs: list) -> dict:
    """Counts for one list, so they add up across cases and runs with the sample size kept.

    situations  -- situations in the list
    added       -- of those, how many no log entry describes: a trigger the parent never logged
    added_parts -- triggers named inside a logged situation that no entry describes ("Dogs (and
                   cats)" when only dogs were logged). Counted per phrase.
    linked      -- answer-key situations at least one list situation was matched to
    split       -- list situations matched to an answer-key situation already matched
    """
    found: set = set()
    added = parts = split = 0
    for m in match:
        refs = [entry_refs[e - 1] for e in m["entries"] if entry_refs[e - 1] is not None]
        if not m["entries"]:
            added += 1
            continue
        parts += len(m["not_in_log"])
        if not refs:
            continue
        counts = Counter(refs)
        best = max(counts.values())
        ref = sorted(r for r, n in counts.items() if n == best)[0]
        if ref in found:
            split += 1
        found.add(ref)
    return {"situations": len(match), "added": added, "added_parts": parts, "linked": len(found),
            "split": split}


def signature(match: list[dict]) -> str:
    """What two runs must share to agree on additions: how many situations were added and how many
    added phrases there were. Which ones is not compared, since the wording changes run to run."""
    return f"added={sum(1 for m in match if not m['entries'])},parts={sum(len(m['not_in_log']) for m in match)}"


def run_once(client, case, prepared) -> dict:
    """Both app calls and both matcher calls for one run. Raises BudgetExceeded to stop everything.
    Any other failure is returned as the run's error, with the step it happened at."""
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT, PRELIMINARY_REPORT_SYSTEM_PROMPT
    from app.models.insight import KIND_SITUATION
    from app.services import insight_service

    out = {"raw": {}, "match": {}, "score": {}, "unlinked_by_extraction": None, "error": None}
    step = "extraction"
    try:
        raw = insight_service.request_extraction(client, EXTRACTION_SYSTEM_PROMPT, prepared["text"])
        out["raw"]["extraction"] = raw
        extraction = insight_service.parse_model_json(raw)
        # The extraction's own entry numbers, as the runner scores them, for comparison with the
        # matcher's reading of the same list.
        out["unlinked_by_extraction"] = ma.score(case, prepared, extraction)["unlinked"]
        step = "fold"
        insights = asyncio.run(_app_pipeline()._first_list(extraction, prepared["by_number"]))
        step = "report"
        raw = insight_service.request_report(client, PRELIMINARY_REPORT_SYSTEM_PROMPT, insights, prepared["text"])
        out["raw"]["report"] = raw
        report = insight_service.parse_model_json(raw)
        names = {
            "extraction": [r.name for r in insights if r.kind == KIND_SITUATION],
            "report": [s.get("name") or "" for s in report.get("situations") or []],
        }
        for which in LISTS:
            step = f"matcher:{which}"
            raw = request_match(client, prepared["text"], names[which])
            out["raw"][f"matcher:{which}"] = raw
            match = read_match(raw, len(names[which]), len(prepared["by_number"]))
            if match is None:
                raise ValueError("matcher reply could not be read")
            out["match"][which] = [{"name": n, **m} for n, m in zip(names[which], match)]
            out["score"][which] = score_list(match, case.expected["entry_refs"])
    except BudgetExceeded:
        raise
    except Exception as e:  # one failed call should not lose the whole run
        out["error"] = f"{step}: {type(e).__name__}"
        out["score"] = {}
    return out


def run_all(client, cases, runs: int):
    """Returns (results, stopped). Each result is {"case", "unlogged_facts", "runs": [...]}."""
    results, stopped = [], None
    for case in cases:
        case = in_date_order(case)
        prepared = ma.prepare(case)
        logged = {r for r in case.expected["entry_refs"] if r is not None}
        result = {"case": case.id, "unlogged_facts": len(set(case.expected["situations"]) - logged),
                  "runs": []}
        results.append(result)
        for _ in range(runs):
            try:
                result["runs"].append(run_once(client, case, prepared))
            except BudgetExceeded as e:
                stopped = str(e)
                break
        if stopped:
            break
    if results and not results[-1]["runs"]:
        results.pop()
    return results, stopped


def _totals(runs: list[dict], which: str) -> dict:
    return {k: sum(r["score"][which][k] for r in runs) for k in SUMMED}


def build_report(results, *, runs_per_case: int, cases_planned: int, budget, stopped) -> dict:
    """Counts only: no case text and none of the models' answers, so it can go in a pull request."""
    from app.services.insight_service import EXTRACTION_MODEL, REPORT_MODEL

    all_runs = [r for c in results for r in c["runs"]]
    scored = [r for r in all_runs if r["score"]]
    rep = {
        "models": {"extraction": EXTRACTION_MODEL, "report": REPORT_MODEL, "matcher": MATCHER_MODEL},
        "runs_per_case": runs_per_case,
        "cases_planned": cases_planned,
        "cases_run": len(results),
        "runs": len(all_runs),
        "runs_scored": len(scored),
        "errors": dict(Counter(r["error"] for r in all_runs if r["error"])),
        "spent_usd": round(budget.spent_usd, 4),
        "limit_usd": budget.limit_usd,
        "calls": budget.calls,
        "stopped": stopped,
        "unlinked_by_extraction": sum(r["unlinked_by_extraction"] for r in scored),
        "families_with_unlogged_facts": [c["case"] for c in results if c["unlogged_facts"]],
    }
    for which in LISTS:
        rep[which] = {
            "totals": _totals(scored, which),
            "runs_with_an_addition": sum(1 for r in scored
                                         if r["score"][which]["added"] or r["score"][which]["added_parts"]),
            "by_run": [_totals([c["runs"][i] for c in results if len(c["runs"]) > i and c["runs"][i]["score"]], which)
                       for i in range(runs_per_case)],
            "cases_with_an_addition": sum(1 for c in results
                                          if any(r["score"] and (r["score"][which]["added"] or r["score"][which]["added_parts"])
                                                 for r in c["runs"])),
            "stability": _stability(results, which),
        }
    rep["per_case"] = [
        {"case": c["case"], "runs_scored": sum(1 for r in c["runs"] if r["score"]),
         **{f"{w}_{k}": sum(r["score"][w][k] for r in c["runs"] if r["score"])
            for w in LISTS for k in ("situations", "added", "added_parts")}}
        for c in results
    ]
    rep["not_covered"] = NOT_COVERED
    return rep


def _stability(results, which: str) -> dict:
    figures = [stability([signature(r["match"][which]) for r in c["runs"] if r["score"]]) for c in results]
    figures = [f for f in figures if f is not None]
    return {"mean": round(sum(figures) / len(figures), 3) if figures else None,
            "cases_all_runs_agree": sum(1 for f in figures if f == 1.0), "cases": len(figures)}


def _ratio(a, b):
    return f"{a}/{b} ({a / b:.2f})" if b else f"{a}/0"


def markdown(rep: dict) -> str:
    m = rep["models"]
    lines = [
        "# Triggers the parent never logged: extraction prompt vs preliminary report prompt",
        "",
        f"- Extraction `{m['extraction']}`, report `{m['report']}`, both with the app's prompts. "
        f"Matcher `{m['matcher']}`, not told which prompt wrote a list.",
        "- Pool families: the working half (odd-numbered).",
        f"- {rep['cases_run']} of {rep['cases_planned']} families, {rep['runs_per_case']} runs each: "
        f"{rep['runs']} runs, {rep['runs_scored']} fully scored.",
        f"- Spent ${rep['spent_usd']:.4f} of a ${rep['limit_usd']:.2f} limit, over {rep['calls']} calls.",
    ]
    if rep["stopped"]:
        lines.append(f"- **Stopped early:** {rep['stopped']}.")
    if rep["errors"]:
        lines.append("- Runs not scored: " + ", ".join(f"{k} ({v})" for k, v in rep["errors"].items()) + ".")
    e, r = rep["extraction"], rep["report"]
    lines += [
        "",
        "## Counts",
        "",
        "Every count is over runs, not families: one family run 3 times counts 3 times.",
        "",
        "| | Extraction | Report |",
        "|---|---|---|",
        f"| Situations listed | {e['totals']['situations']} | {r['totals']['situations']} |",
        f"| Situations no log entry describes | {_ratio(e['totals']['added'], e['totals']['situations'])} "
        f"| {_ratio(r['totals']['added'], r['totals']['situations'])} |",
        f"| Unlogged triggers named inside a logged situation | {e['totals']['added_parts']} | {r['totals']['added_parts']} |",
        f"| Runs with any addition | {_ratio(e['runs_with_an_addition'], rep['runs_scored'])} "
        f"| {_ratio(r['runs_with_an_addition'], rep['runs_scored'])} |",
        f"| Families with an addition in any run | {_ratio(e['cases_with_an_addition'], rep['cases_run'])} "
        f"| {_ratio(r['cases_with_an_addition'], rep['cases_run'])} |",
        f"| Answer-key situations matched | {e['totals']['linked']} | {r['totals']['linked']} |",
        f"| A second situation for one already matched | {e['totals']['split']} | {r['totals']['split']} |",
        "",
        f"For comparison, extraction situations that cited no entry themselves: {rep['unlinked_by_extraction']}.",
        "",
        "## Run by run",
        "",
        "| Run | Extraction: added situations | Extraction: added inside | Report: added situations | Report: added inside |",
        "|---|---|---|---|---|",
    ]
    for i, (be, br) in enumerate(zip(e["by_run"], r["by_run"]), 1):
        lines.append(f"| {i} | {be['added']} of {be['situations']} | {be['added_parts']} "
                     f"| {br['added']} of {br['situations']} | {br['added_parts']} |")
    lines += ["", "## Stability", ""]
    for name, s in (("Extraction", e["stability"]), ("Report", r["stability"])):
        if s["cases"]:
            lines.append(f"- {name}: all runs gave the same number of additions on "
                         f"{s['cases_all_runs_agree']} of {s['cases']} families (mean share {s['mean']:.2f}).")
    lines += [
        "", "## Per family", "",
        "| Family | Runs | Extraction: listed / added / added inside | Report: listed / added / added inside |",
        "|---|---|---|---|",
    ]
    for c in rep["per_case"]:
        lines.append(f"| {c['case']} | {c['runs_scored']} | {c['extraction_situations']} / {c['extraction_added']} / "
                     f"{c['extraction_added_parts']} | {c['report_situations']} / {c['report_added']} / "
                     f"{c['report_added_parts']} |")
    lines += ["", "## What these counts don't cover", ""]
    lines += [f"- {n}" for n in rep["not_covered"]]
    if rep["families_with_unlogged_facts"]:
        lines.append("- These families have an answer-key situation the log never mentions, so an addition "
                     "there could be a right guess. Read them by hand: "
                     + ", ".join(rep["families_with_unlogged_facts"]) + ".")
    return "\n".join(lines) + "\n"


NOT_COVERED = [
    "Whether a trigger was logged is the matcher's reading, a model's. No person has checked it. "
    "Read `outputs.jsonl` before trusting a count.",
    "An added trigger is counted, not judged. Whether adding it is good clinical synthesis or a "
    "mistake is the question for Peter, not something these counts answer.",
    "The answer keys are the generating agents' labels. No clinician has checked them.",
    "Each run is a first analysis. A patient with items already saved, or items a clinician removed, "
    "gives the report a different list.",
    "Only the report's situations are read. Its treatment targets, parent responses and safety "
    "behaviors are not.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--families", help="comma-separated pool family ids, from the working half")
    p.add_argument("--limit", type=int, help="the first N families")
    p.add_argument("--runs", type=int, default=3, help="runs per family (default 3)")
    p.add_argument("--budget", type=float, default=9.0, help="spending limit in dollars (default 9)")
    p.add_argument("--out", type=Path, help="report folder (default runs/<timestamp>-triggers)")
    a = p.parse_args(argv)
    if a.runs < 1:
        p.error("--runs must be at least 1")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Nothing was run.", file=sys.stderr)
        return 2

    from anthropic import Anthropic

    cases = load_cases(ma.NAME, a.families.split(",") if a.families else None, a.limit, only="working")
    budget = Budget(a.budget)
    results, stopped = run_all(MeteredClient(Anthropic(), budget), cases, a.runs)
    rep = build_report(results, runs_per_case=a.runs, cases_planned=len(cases), budget=budget, stopped=stopped)
    out = a.out or HERE / "runs" / (datetime.now().strftime("%Y%m%d_%H%M%S") + "-triggers")
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(rep, indent=2) + "\n")
    (out / "report.md").write_text(markdown(rep))
    (out / "outputs.jsonl").write_text("".join(
        json.dumps({"case": c["case"], "run": i, **r}, ensure_ascii=False) + "\n"
        for c in results for i, r in enumerate(c["runs"], 1)))
    print(markdown(rep))
    print(f"Written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
