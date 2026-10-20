"""Run the held-out cases and print scores only.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/judging/run_held_out.py --runs 3 --budget 10

The agent tuning a prompt must never read the held-out cases it failed (README.md beside this file).
So this prints totals, check counts and the stability figure, and nothing that names or quotes a
case: no case text, none of the model's answers, no per-case rows and no case ids. It writes no
files. An error is printed as its type only, because an error message can quote the input.

It runs the runner's own code (`AI-dev/evals/runner/`), so held-out and working scores are counted
the same way. Needs ANTHROPIC_API_KEY. Touches no database.
"""
import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HELD_OUT = HERE / "held_out"
sys.path.insert(0, str(HERE.parent / "runner"))

import report  # noqa: E402
from budget import Budget, MeteredClient  # noqa: E402
from cases import load_cases  # noqa: E402
from engine import run_cases  # noqa: E402
from run import FEATURES  # noqa: E402

# Keys of the runner's report that point at a single case.
PER_CASE = ("per_case",)


def scores_only(rep: dict) -> dict:
    out = {k: v for k, v in rep.items() if k not in PER_CASE}
    out["held_out"] = True
    return out


def held_out(feature, client, budget: Budget, runs: int, folder: Path = HELD_OUT) -> dict | None:
    """The scores-only report, or None when the folder has no cases."""
    cases = load_cases(feature.NAME, pool=folder)
    if not cases:
        return None
    results, stopped = run_cases(feature, cases, MeteredClient(client, budget), runs)
    return scores_only(report.build(feature, results, runs_per_case=runs, cases_planned=len(cases),
                                    budget=budget, stopped=stopped))


def _anthropic():
    from anthropic import Anthropic
    return Anthropic()


def main(argv=None, make_client=_anthropic) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--feature", choices=sorted(FEATURES), default="monitoring_analysis")
    p.add_argument("--runs", type=int, default=3, help="runs per case (default 3)")
    p.add_argument("--budget", type=float, default=10.0, help="spending limit in dollars (default 10)")
    p.add_argument("--json", action="store_true", help="print the report as JSON")
    p.add_argument("--folder", type=Path, default=HELD_OUT, help=argparse.SUPPRESS)  # for the tests
    a = p.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Nothing was run.", file=sys.stderr)
        return 2

    budget = Budget(a.budget)
    try:
        rep = held_out(FEATURES[a.feature], make_client(), budget, a.runs, a.folder)
    except Exception as e:
        # The message could quote a case (a bad date, a missing key's neighbours), so only the type.
        print(f"The held-out run failed: {type(e).__name__}. Spent ${budget.spent_usd:.4f}.",
              file=sys.stderr)
        return 1
    if rep is None:
        print("No held-out cases yet. Nothing was run.")
        return 0
    print(json.dumps(rep, indent=2) if a.json else report.markdown(rep))
    return 0


if __name__ == "__main__":
    sys.exit(main())
