"""The report: scores and counts with their sample sizes, and what the cases don't cover.

It holds no case text and none of the model's answers, only ids, counts and the stability figure.
The answers are written separately (`outputs.jsonl`) for reading by hand. That keeps the report safe
to paste into a pull request, and is the shape the held-out report needs later.
"""
import hashlib
import json

# Each feature says what it counts (`SUMMED`), which counts are scores and what each is out of
# (`SCORES`), which go in the per-case table (`PER_CASE`), and when two runs agree (`AGREEMENT`).


def _ratio(a: int, b: int) -> str:
    return f"{a}/{b} ({a / b:.2f})" if b else f"{a}/0 (none to score)"


def _cell(totals: dict, key: str, out_of: str | None) -> str:
    return _ratio(totals[key], totals[out_of]) if out_of else str(totals[key])


def _by_run(results, runs_per_case: int, summed) -> list[dict]:
    """The totals for each run number: every case's first run added up, then every case's second,
    and so on. How far apart they are shows how much a score moves from one run of the whole set to
    the next."""
    out = []
    for i in range(runs_per_case):
        scored = [c.runs[i].score for c in results if len(c.runs) > i and c.runs[i].score]
        out.append({"runs_scored": len(scored), **{k: sum(s[k] for s in scored) for k in summed}})
    return out


def _cases_varied(results, summed) -> dict[str, int]:
    """For each score, how many cases did not give the same count on every run. Only cases with
    two or more scored runs can vary."""
    out = {}
    for k in summed:
        out[k] = sum(1 for c in results
                     if len({r.score[k] for r in c.runs if r.score}) > 1)
    return out


def _review_counts(feature, results) -> dict:
    """The reviewers' verdicts, counted per group (the feature's `group(case_id)`, or "all") and per
    reviewer, plus all of them together. Counts are over reviewed items: one per run for a step
    sentence, one per suggestion for rungs. No reasons and no text, only counts and rule ids."""
    group_of = getattr(feature, "group", lambda case_id: "all")
    out: dict[str, dict] = {}

    def blank():
        return {"items": 0, "show": 0, "dont_show": 0, "unanswered": 0, "opinion_only": 0,
                "broken": {}}

    def verdict_at(rv, i):
        return rv["verdicts"][i] if rv["verdicts"] and i < len(rv["verdicts"]) else None

    for c in results:
        g = out.setdefault(group_of(c.case_id), {})
        for r in c.runs:
            if not r.reviews:
                continue
            # When no reviewer's answer could be read the item count is unknown, and the run counts
            # as one unanswered item rather than vanishing from the totals.
            n_items = max((len(rv["verdicts"]) for rv in r.reviews if rv["verdicts"]), default=1)
            for rv in r.reviews:
                t = g.setdefault(rv["concern"], blank())
                for i in range(n_items):
                    v = verdict_at(rv, i)
                    t["items"] += 1
                    t[(v and v["verdict"]) or "unanswered"] += 1
                    if v:
                        t["opinion_only"] += int(v["opinion_only"])
                        for rule in v["broken"]:
                            t["broken"][rule] = t["broken"].get(rule, 0) + 1
            together = g.setdefault("all reviewers together", blank())
            for i in range(n_items):
                vs = [(verdict_at(rv, i) or {}).get("verdict") for rv in r.reviews]
                together["items"] += 1
                together["dont_show" if "dont_show" in vs else "unanswered" if None in vs else "show"] += 1
    return {g: v for g, v in out.items() if v}


HALF_TEXT = {
    "working": "the working half (odd-numbered), the ones prompts may be tuned on",
    "held_out": "the held-out half (even-numbered)",
    "all": "all of them, held-out ones included",
}


def build(feature, results, *, runs_per_case: int, cases_planned: int, budget, stopped,
          reviewers=(), half: str | None = None, temperature: float | None = None) -> dict:
    summed = feature.SUMMED
    all_runs = [r for c in results for r in c.runs]
    scored = [r.score for r in all_runs if r.score]
    totals = {k: sum(s[k] for s in scored) for k in summed}

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
        "half": half,
        "temperature": temperature,
        "runs_per_case": runs_per_case,
        "cases_planned": cases_planned,
        "cases_run": len(results),
        "families_run": len({c.case_id.split("/")[0] for c in results}),
        "runs": len(all_runs),
        "runs_with_error": sum(1 for r in all_runs if r.error),
        "runs_scored": len(scored),
        "spent_usd": round(budget.spent_usd, 4),
        "limit_usd": budget.limit_usd,
        "calls": budget.calls,
        "stopped": stopped,
        "checks": checks,
        "totals": totals,
        "scores": [list(s) for s in feature.SCORES],
        "per_case_columns": [list(s) for s in feature.PER_CASE],
        "agreement": feature.AGREEMENT,
        "by_run": _by_run(results, runs_per_case, summed),
        "cases_varied": _cases_varied(results, summed),
        "cases_with_two_scored_runs": sum(1 for c in results if sum(1 for r in c.runs if r.score) > 1),
        "stability": {
            "mean": round(sum(stabilities) / len(stabilities), 3) if stabilities else None,
            "cases_all_runs_agree": sum(1 for s in stabilities if s == 1.0),
            "cases": len(stabilities),
        },
        "reviewers": [getattr(r, "__name__", repr(r)) for r in reviewers],
        "reviews_checked": all(rv["checked"] for c in results for r in c.runs for rv in r.reviews),
        "reviews": _review_counts(feature, results),
        "per_case": [
            {
                "case": c.case_id,
                "runs": len(c.runs),
                "checks_failed": sum(1 for r in c.runs if any(r.checks.values())),
                "errors": sum(1 for r in c.runs if r.error),
                **{k: sum(r.score[k] for r in c.runs if r.score) for k in summed},
                "stability": None if c.stability is None else round(c.stability, 3),
            }
            for c in results
        ],
        "not_covered": list(feature.NOT_COVERED),
    }


def _temperature_text(t: float | None) -> str:
    return "the app's own setting" if t is None else f"{t:g}, set by the runner in place of the app's"


def markdown(rep: dict) -> str:
    t = rep["totals"]
    lines = [
        f"# {rep['feature']}: {'held-out cases, scores only' if rep.get('held_out') else 'test run'}",
        "",
        f"- Model `{rep['model']}`, the app's prompt (sha256 `{rep['prompt_sha256']}`).",
        f"- Pool families: {HALF_TEXT.get(rep.get('half'), 'picked by hand')}.",
        f"- Temperature: {_temperature_text(rep.get('temperature'))}.",
        f"- {rep['cases_run']} of {rep['cases_planned']} cases, {rep['runs_per_case']} runs each: "
        f"{rep['runs']} runs, {rep['runs_scored']} the app could read, {rep['runs_with_error']} failed calls.",
        f"- Spent ${rep['spent_usd']:.4f} of a ${rep['limit_usd']:.2f} limit, over {rep['calls']} calls.",
    ]
    if rep["stopped"]:
        lines.append(f"- **Stopped early:** {rep['stopped']}.")
    lines += ["", "## Code checks", "", "| Check | Runs failed |", "|---|---|"]
    for name, c in rep["checks"].items():
        lines.append(f"| {name} | {c['failed_runs']} of {c['runs']} |")
    by_run = rep["by_run"]
    lines += [
        "",
        "## Scores",
        "",
        "The first column adds up every run. The next ones add up each run number on its own (every "
        "case's first run, then every case's second), to show how much a score moves between runs. "
        "The last column is how many cases did not give the same count on every run.",
        "",
        "| Score | All runs | " + " | ".join(f"Run {i}" for i in range(1, len(by_run) + 1))
        + " | Cases where runs differed |",
        "|---" * (len(by_run) + 3) + "|",
    ]
    varied, two = rep["cases_varied"], rep["cases_with_two_scored_runs"]
    for label, key, out_of in rep["scores"]:
        lines.append(f"| {label} | {_cell(t, key, out_of)} | "
                     + " | ".join(_cell(r, key, out_of) for r in by_run)
                     + f" | {varied[key]} of {two} |")
    lines += [
        "",
        "Each count in the first column is over runs, not cases: one case run 3 times counts 3 "
        f"times. The cases are {rep['cases_run']}, from {rep['families_run']} families, so these are "
        "small numbers.",
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
            rep["agreement"],
        ]
    else:
        lines.append("No runs.")
    lines += ["", "## Reviewing agents", ""]
    lines.append(", ".join(rep["reviewers"]) if rep["reviewers"] else "None in this run.")
    if rep.get("reviews"):
        if not rep["reviews_checked"]:
            lines += ["", "**Unchecked.** No clinician has marked these items, so nothing says whether "
                          "the reviewers agree with one."]
        lines += [
            "",
            "Counts are over reviewed items. \"Don't show\" counts only when the reviewer named one "
            "of its own rules. \"Opinion only\" is a \"don't show\" with no rule behind it, counted "
            "as show. \"All reviewers together\" is don't show when any one of them found a broken "
            "rule.",
        ]
        for group, by_concern in rep["reviews"].items():
            lines += ["", f"### {group}", "",
                      "| Reviewer | Items | Show | Don't show | Unanswered | Opinion only | Rules broken |",
                      "|---|---|---|---|---|---|---|"]
            for concern, t in by_concern.items():
                together = concern == "all reviewers together"
                broken = "–" if together else (
                    ", ".join(f"{k} {n}" for k, n in sorted(t["broken"].items())) or "none")
                lines.append(f"| {concern} | {t['items']} | {_ratio(t['show'], t['items'])} | "
                             f"{_ratio(t['dont_show'], t['items'])} | {t['unanswered']} | "
                             f"{'–' if together else t['opinion_only']} | {broken} |")
    # The held-out report (AI-dev/evals/judging/) has no per-case rows: they would say which case to
    # go and read.
    if "per_case" in rep:
        cols = rep["per_case_columns"]
        lines += [
            "", "## Per case", "",
            "| Case | Runs | Checks failed | " + " | ".join(c[0] for c in cols) + " | Stability |",
            "|---" * (len(cols) + 4) + "|",
        ]
        for c in rep["per_case"]:
            stab = "–" if c["stability"] is None else f"{c['stability']:.2f}"
            cells = [f"{c[key]}/{c[out_of]}" if out_of else str(c[key]) for _, key, out_of in cols]
            lines.append(f"| {c['case']} | {c['runs']} | {c['checks_failed']} | " + " | ".join(cells)
                         + f" | {stab} |")
    lines += ["", "## What these cases don't cover", ""]
    lines += [f"- {n}" for n in rep["not_covered"]]
    return "\n".join(lines) + "\n"


def outputs_jsonl(results) -> str:
    """The model's answers, one line per run, for reading by hand. Not part of the report."""
    rows = []
    for c in results:
        for i, r in enumerate(c.runs, 1):
            rows.append(json.dumps({"case": c.case_id, "run": i, "error": r.error, "raw": r.raw,
                                    "checks": r.checks, "score": r.score, "reviews": r.reviews},
                                   ensure_ascii=False))
    return "\n".join(rows) + ("\n" if rows else "")
