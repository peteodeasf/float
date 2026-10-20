"""Run the rung reviewers on the 60 suggestions Dr. Walker reviewed on 2026-08-29, and, given her
marks, count how often they agree with her.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/judging/check_rung_reviewer.py \\
        --runs 3 --budget 10 [--marks ~/walker-marks.csv]

The 60 are the suggestions in "AI-dev/Ladder Eval/cases_drafted*.json" (Claude drafts from
2026-08-28), 16 situations with suggestions. Her marks are not in the repo. They are in the review
tables of the production database, and agents never copy production data. Without --marks the
reviewers still run, and the report gives their verdicts with no agreement figures. README.md says
how Peter can export the marks.

Sixty is a small sample, and she marked fewer than that. It can show the reviewer is badly off. It
cannot show it is right.

Needs ANTHROPIC_API_KEY. Touches no database. Writes runs/<timestamp>/ beside this file (not
committed): report.md and report.json (counts only), and outputs.jsonl (every verdict, with reasons).
"""
import argparse
import csv
import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "runner"))
sys.path.insert(0, str(HERE))

import app_code  # noqa: E402,F401  (puts backend/ on the path, for the feature's model)
import reviewers as rv  # noqa: E402
from budget import Budget, BudgetExceeded, MeteredClient  # noqa: E402
from engine import stability  # noqa: E402

LADDER_EVAL = ROOT / "AI-dev" / "Ladder Eval"
SOURCES = ["cases_drafted.json", "cases_drafted_round2.json", "cases_drafted_round3.json"]
HER_MARK = {"show": rv.SHOW, "hide": rv.DONT_SHOW}

NOT_COVERED = [
    "The 60 are Claude drafts from 2026-08-28, not what the app's prompt writes today.",
    "The rules the reviewer is given were written from her comments on these same 60. Agreement "
    "here will look better than it would on suggestions she has not seen.",
    "Only the suggestions she marked count towards agreement. docs/plans/ladder-generation.md "
    "records that she marked 26 of 60.",
    "None of these situations has the child's age, so the age reviewer judged for any age 8 to 17.",
    "None has a feared outcome.",
    "Sixty suggestions can show the reviewer is badly off. They cannot show it is right.",
]


def situations(folder: Path = LADDER_EVAL) -> list[dict]:
    """Each situation with suggestions, as {id, item}, in file order. A suggestion's key is
    `<situation id>:<position>`, the key the review page saved her mark under."""
    out = []
    for name in SOURCES:
        for c in json.loads((folder / name).read_text()):
            suggestions = c.get("target_suggestions") or []
            if not suggestions:
                continue
            item = rv.rung_item(
                c["situation"], suggestions, rating=c.get("distress_rating"),
                recorded=[(r["name"], r.get("behavior_type")) for r in c.get("existing_rungs") or []],
            )
            out.append({"id": c["id"], "item": item})
    return out


def load_marks(path: Path, sits: list[dict]) -> tuple[dict[str, str], list[str]]:
    """Her marks from a CSV with columns item_key, choice, and optionally suggestion.

    Returns ({key: show|dont_show}, [problems]). A mark is dropped, and listed as a problem, when its
    key is not one of the 60, its choice is not show or hide, or its suggestion text (if given)
    is not the suggestion at that key: that would mean the round's order differs from the files.
    """
    text = {f"{s['id']}:{i}": t for s in sits for i, t in enumerate(s["item"]["items"])}
    marks, problems = {}, []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            key, choice = row.get("item_key", "").strip(), row.get("choice", "").strip()
            if key not in text:
                problems.append(f"{key}: not one of the 60")
            elif choice not in HER_MARK:
                problems.append(f"{key}: choice {choice!r} is not show or hide")
            elif row.get("suggestion") and row["suggestion"].strip() != text[key]:
                problems.append(f"{key}: the suggestion at this key is different text")
            else:
                marks[key] = HER_MARK[choice]
    return marks, problems


def run(sits, reviewers, client, runs: int):
    """[(situation id, run number, Review)], and why it stopped early, or None."""
    results = []
    for s in sits:
        for n in range(1, runs + 1):
            for r in reviewers:
                try:
                    results.append((s["id"], n, rv.review(r, client, s["item"])))
                except BudgetExceeded as e:
                    return results, str(e)
                except Exception as e:  # one failed call should not lose the run
                    results.append((s["id"], n, rv.Review(r.concern, r.feature, r.checked, None,
                                                          error=type(e).__name__)))
    return results, None


def _verdicts(results, sits) -> dict:
    """{reviewer or "all": {key: [verdict per run]}}. "all" is the three together
    (`reviewers.combined`), only for runs where all three were asked."""
    keys = {s["id"]: [f"{s['id']}:{i}" for i in range(len(s["item"]["items"]))] for s in sits}
    out: dict[str, dict[str, list]] = {}
    by_run: dict[tuple, list] = {}
    for sid, n, review in results:
        by_run.setdefault((sid, n), []).append(review)
        for i, key in enumerate(keys[sid]):
            v = review.verdicts[i].verdict if review.verdicts else None
            out.setdefault(review.concern, {}).setdefault(key, []).append(v)
    for (sid, n), reviews in by_run.items():
        if len(reviews) == len(rv.CONCERNS):
            for i, key in enumerate(keys[sid]):
                out.setdefault("all", {}).setdefault(key, []).append(rv.combined(reviews, i))
    return out


def build(results, sits, runs: int, marks: dict | None, budget: Budget, stopped) -> dict:
    verdicts = _verdicts(results, sits)
    rep = {
        "suggestions": sum(len(s["item"]["items"]) for s in sits),
        "situations": len(sits),
        "runs_per_suggestion": runs,
        "models": {"reviewers": rv.REVIEWER_MODEL["rungs"], "feature": rv.feature_model("rungs")},
        "spent_usd": round(budget.spent_usd, 4),
        "calls": budget.calls,
        "stopped": stopped,
        "her_marks": None if marks is None else {
            "marked": len(marks), "show": sum(v == rv.SHOW for v in marks.values()),
            "dont_show": sum(v == rv.DONT_SHOW for v in marks.values())},
        "reviewers": {},
        "not_covered": NOT_COVERED,
    }
    for name in list(rv.CONCERNS) + ["all"]:
        per_key = verdicts.get(name, {})
        every = [v for vs in per_key.values() for v in vs]
        entry = {
            "verdicts": len(every),
            "show": every.count(rv.SHOW),
            "dont_show": every.count(rv.DONT_SHOW),
            "no_verdict": every.count(None),
            "stability": _mean([stability([v for v in vs if v is not None])
                                for vs in per_key.values()]),
        }
        if name != "all":
            mine = [r for _, _, r in results if r.concern == name]
            vs = [v for r in mine if r.verdicts for v in r.verdicts]
            entry["opinion_only"] = sum(v.opinion_only for v in vs)
            entry["said_show_but_named_a_rule"] = sum(v.show_with_broken_rule for v in vs)
            entry["opinions_given"] = sum(len(v.opinions) for v in vs)
            entry["rules_named"] = dict(Counter(rule for v in vs for rule, _ in v.broken))
            entry["errors"] = dict(Counter(r.error for r in mine if r.error))
        if marks is not None:
            entry["agreement"] = agreement(per_key, marks)
        rep["reviewers"][name] = entry
    return rep


def agreement(per_key: dict[str, list], marks: dict[str, str]) -> dict:
    """Counts over every run of every suggestion she marked. A run with no verdict is left out
    and counted as such, so the total is always said."""
    c = Counter()
    for key, hers in marks.items():
        for v in per_key.get(key, []):
            if v is None:
                c["no_verdict"] += 1
            else:
                c[f"she_{hers}__reviewer_{v}"] += 1
    agreed = c[f"she_{rv.SHOW}__reviewer_{rv.SHOW}"] + c[f"she_{rv.DONT_SHOW}__reviewer_{rv.DONT_SHOW}"]
    total = sum(n for k, n in c.items() if k != "no_verdict")
    return {"agreed": agreed, "out_of": total, **dict(c)}


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 3) if xs else None


def markdown(rep: dict) -> str:
    names = {"her_rules": "Dr. Walker's rules", "child_safety": "Child's safety",
             "age": "Reads right for the age", "all": "All three together"}
    out = ["# Rung reviewers on Dr. Walker's 60 suggestions", ""]
    out.append(f"{rep['suggestions']} suggestions across {rep['situations']} situations, "
               f"{rep['runs_per_suggestion']} runs each. Reviewers on {rep['models']['reviewers']}; "
               f"the feature runs on {rep['models']['feature']}.")
    out.append(f"Spent ${rep['spent_usd']:.2f} over {rep['calls']} calls.")
    if rep["stopped"]:
        out.append(f"**Stopped early:** {rep['stopped']}")
    out.append("")
    if rep["her_marks"] is None:
        out.append("**No agreement figures:** her marks were not given (--marks).")
    else:
        m = rep["her_marks"]
        out.append(f"Her marks: {m['marked']} suggestions marked, {m['show']} show and "
                   f"{m['dont_show']} don't show.")
    out.append("")
    out.append("A verdict is one reviewer's answer on one suggestion in one run. \"Don't show\" "
               "counts only when the reviewer named a broken rule.")
    out.append("")
    for name, e in rep["reviewers"].items():
        out.append(f"## {names[name]}")
        out.append(f"- Verdicts: {e['verdicts']}. Show {e['show']}, don't show {e['dont_show']}, "
                   f"no verdict {e['no_verdict']}.")
        out.append(f"- Stability (share of runs giving the most common verdict, averaged over "
                   f"suggestions): {e['stability']}")
        if "rules_named" in e:
            rules = ", ".join(f"{k} {n}" for k, n in sorted(e["rules_named"].items())) or "none"
            out.append(f"- Broken rules named: {rules}.")
            out.append(f"- Said don't show with only an opinion behind it (counted as show): "
                       f"{e['opinion_only']}. Opinions given in all: {e['opinions_given']}.")
            out.append(f"- Said show but named a broken rule (counted as don't show): "
                       f"{e['said_show_but_named_a_rule']}.")
            if e["errors"]:
                out.append(f"- Failed calls: " + ", ".join(f"{k} {n}" for k, n in e["errors"].items()))
        if "agreement" in e:
            a = e["agreement"]
            out.append(f"- **Agrees with her on {a['agreed']} of {a['out_of']}.** "
                       f"She said show, reviewer show {a.get('she_show__reviewer_show', 0)}, "
                       f"reviewer don't show {a.get('she_show__reviewer_dont_show', 0)}. "
                       f"She said don't show, reviewer don't show "
                       f"{a.get('she_dont_show__reviewer_dont_show', 0)}, reviewer show "
                       f"{a.get('she_dont_show__reviewer_show', 0)}. No verdict "
                       f"{a.get('no_verdict', 0)}.")
        out.append("")
    out.append("## Not covered")
    out += [f"- {x}" for x in rep["not_covered"]]
    return "\n".join(out) + "\n"


def outputs_jsonl(results) -> str:
    lines = []
    for sid, n, r in results:
        lines.append(json.dumps({
            "situation": sid, "run": n, "reviewer": r.concern, "error": r.error,
            "verdicts": None if r.verdicts is None else [
                {"key": f"{sid}:{i}", "said": v.said, "verdict": v.verdict,
                 "broken": v.broken, "opinions": v.opinions} for i, v in enumerate(r.verdicts)],
        }))
    return "\n".join(lines) + ("\n" if lines else "")


def _anthropic():
    from anthropic import Anthropic
    return Anthropic()


def main(argv=None, make_client=_anthropic) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--runs", type=int, default=3, help="runs per suggestion (default 3)")
    p.add_argument("--budget", type=float, default=10.0, help="spending limit in dollars (default 10)")
    p.add_argument("--marks", type=Path, help="CSV of her marks: item_key, choice[, suggestion]")
    p.add_argument("--limit", type=int, help="the first N situations")
    p.add_argument("--out", type=Path, help="report folder (default runs/<timestamp>)")
    a = p.parse_args(argv)
    if a.runs < 1:
        p.error("--runs must be at least 1")

    rv.check_models()
    sits = situations()[: a.limit]
    marks = None
    if a.marks:
        marks, problems = load_marks(a.marks, sits)
        for problem in problems:
            print(f"mark dropped: {problem}", file=sys.stderr)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Nothing was run.", file=sys.stderr)
        return 2

    budget = Budget(a.budget)
    results, stopped = run(sits, rv.load_all("rungs"), MeteredClient(make_client(), budget), a.runs)
    rep = build(results, sits, a.runs, marks, budget, stopped)
    out = a.out or HERE / "runs" / datetime.now().strftime("%Y%m%d_%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(rep, indent=2) + "\n")
    (out / "report.md").write_text(markdown(rep))
    (out / "outputs.jsonl").write_text(outputs_jsonl(results))
    print(markdown(rep))
    print(f"Written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
