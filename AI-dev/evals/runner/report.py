"""The report: scores and counts with their sample sizes, and what the cases don't cover.

It holds no case text and none of the model's answers, only ids, counts and the stability figure.
The answers are written separately (`outputs.jsonl`) for reading by hand. That keeps the report safe
to paste into a pull request, and is the shape the held-out report needs later.
"""
import hashlib
import json

SUMMED = ("situations", "situations_found", "behaviors", "types_right",
          "extra_behaviors", "unlinked", "split")


def _ratio(a: int, b: int) -> str:
    return f"{a}/{b} ({a / b:.2f})" if b else f"{a}/0 (none to score)"


def build(feature, results, *, runs_per_case: int, cases_planned: int, budget, stopped,
          reviewers=()) -> dict:
    all_runs = [r for c in results for r in c.runs]
    scored = [r.score for r in all_runs if r.score]
    totals = {k: sum(s[k] for s in scored) for k in SUMMED}

    check_names = sorted({name for r in all_runs for name in r.checks})
    checks = {name: {"failed_runs": sum(1 for r in all_runs if r.checks.get(name)),
                     "runs": sum(1 for r in all_runs if name in r.checks)}
              for name in check_names}

    stabilities = [c.stability for c in results if c.stability is not None]
    prompt = feature.app_prompt()
    return {
        "feature": feature.NAME,
        "model": feature.model(),
        "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest()[:12],
        "runs_per_case": runs_per_case,
        "cases_planned": cases_planned,
        "cases_run": len(results),
        "runs": len(all_runs),
        "runs_with_error": sum(1 for r in all_runs if r.error),
        "runs_scored": len(scored),
        "spent_usd": round(budget.spent_usd, 4),
        "limit_usd": budget.limit_usd,
        "calls": budget.calls,
        "stopped": stopped,
        "checks": checks,
        "totals": totals,
        "stability": {
            "mean": round(sum(stabilities) / len(stabilities), 3) if stabilities else None,
            "cases_all_runs_agree": sum(1 for s in stabilities if s == 1.0),
            "cases": len(stabilities),
        },
        "reviewers": [getattr(r, "__name__", repr(r)) for r in reviewers],
        "per_case": [
            {
                "case": c.case_id,
                "runs": len(c.runs),
                "checks_failed": sum(1 for r in c.runs if any(r.checks.values())),
                "errors": sum(1 for r in c.runs if r.error),
                **{k: sum(r.score[k] for r in c.runs if r.score) for k in SUMMED},
                "stability": None if c.stability is None else round(c.stability, 3),
            }
            for c in results
        ],
        "not_covered": list(feature.NOT_COVERED),
    }


def markdown(rep: dict) -> str:
    t = rep["totals"]
    lines = [
        f"# {rep['feature']}: test run",
        "",
        f"- Model `{rep['model']}`, the app's prompt (sha256 `{rep['prompt_sha256']}`).",
        f"- {rep['cases_run']} of {rep['cases_planned']} cases, {rep['runs_per_case']} runs each: "
        f"{rep['runs']} runs, {rep['runs_scored']} the app could read, {rep['runs_with_error']} failed calls.",
        f"- Spent ${rep['spent_usd']:.4f} of a ${rep['limit_usd']:.2f} limit, over {rep['calls']} calls.",
    ]
    if rep["stopped"]:
        lines.append(f"- **Stopped early:** {rep['stopped']}.")
    lines += ["", "## Code checks", "", "| Check | Runs failed |", "|---|---|"]
    for name, c in rep["checks"].items():
        lines.append(f"| {name} | {c['failed_runs']} of {c['runs']} |")
    lines += [
        "",
        "## Scores, added up over every run",
        "",
        f"- Situations found: {_ratio(t['situations_found'], t['situations'])}",
        f"- Behavior types right, in situations found: {_ratio(t['types_right'], t['behaviors'])}",
        f"- Extra behaviors beyond the answer key: {t['extra_behaviors']}",
        f"- Situations pointing at no log entry: {t['unlinked']}",
        f"- Situations split in two: {t['split']}",
        "",
        "Each count is over runs, not cases: one case run 3 times counts 3 times. "
        f"The cases are {rep['cases_run']} families, so these are small numbers.",
        "",
        "## Stability",
        "",
    ]
    s = rep["stability"]
    if s["cases"]:
        lines += [
            f"Share of runs matching the most common answer, averaged over {s['cases']} cases: "
            f"{s['mean']:.2f}. All {rep['runs_per_case']} runs agreed on "
            f"{s['cases_all_runs_agree']} of {s['cases']} cases.",
            "",
            "Two runs agree when they find the same situations with the same behavior types under each. "
            "Wording is ignored.",
        ]
    else:
        lines.append("No runs.")
    lines += ["", "## Reviewing agents", ""]
    lines.append(", ".join(rep["reviewers"]) if rep["reviewers"] else "None yet. They are a later item.")
    lines += [
        "", "## Per case", "",
        "| Case | Runs | Checks failed | Situations found | Types right | Unlinked | Stability |",
        "|---|---|---|---|---|---|---|",
    ]
    for c in rep["per_case"]:
        stab = "–" if c["stability"] is None else f"{c['stability']:.2f}"
        lines.append(
            f"| {c['case']} | {c['runs']} | {c['checks_failed']} | {c['situations_found']}/{c['situations']} "
            f"| {c['types_right']}/{c['behaviors']} | {c['unlinked']} | {stab} |"
        )
    lines += ["", "## What these cases don't cover", ""]
    lines += [f"- {n}" for n in rep["not_covered"]]
    return "\n".join(lines) + "\n"


def outputs_jsonl(results) -> str:
    """The model's answers, one line per run, for reading by hand. Not part of the report."""
    rows = []
    for c in results:
        for i, r in enumerate(c.runs, 1):
            rows.append(json.dumps({"case": c.case_id, "run": i, "error": r.error, "raw": r.raw,
                                    "checks": r.checks, "reviews": r.reviews}, ensure_ascii=False))
    return "\n".join(rows) + ("\n" if rows else "")
