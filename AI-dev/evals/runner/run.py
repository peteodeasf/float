"""Run one AI feature over pool cases and write a report.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/runner/run.py \\
        --feature monitoring_analysis --limit 5 --runs 3 --budget 10

--feature voice_notes runs the voice notes instead, one case per note.

Runs the working half of the pool (odd-numbered families) unless --half all is given.

Needs ANTHROPIC_API_KEY in the environment. It touches no database.
Writes AI-dev/evals/runner/runs/<timestamp>/: report.md, report.json, outputs.jsonl.
"""
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import app_code  # noqa: E402,F401
import monitoring_analysis  # noqa: E402
import report  # noqa: E402
import voice_notes  # noqa: E402
from budget import Budget, MeteredClient  # noqa: E402
from cases import load_cases  # noqa: E402
from engine import run_cases  # noqa: E402

FEATURES = {f.NAME: f for f in (monitoring_analysis, voice_notes)}


def write(out: Path, feature, results, **kw) -> dict:
    rep = report.build(feature, results, **kw)
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(rep, indent=2) + "\n")
    (out / "report.md").write_text(report.markdown(rep))
    (out / "outputs.jsonl").write_text(report.outputs_jsonl(results))
    return rep


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--feature", choices=sorted(FEATURES), default=monitoring_analysis.NAME)
    p.add_argument("--families", help="comma-separated pool family ids")
    p.add_argument("--limit", type=int, help="the first N families")
    p.add_argument("--half", choices=["working", "all"], default="working",
                   help="working: odd-numbered families only, the ones prompts may be tuned on "
                        "(default). all: every pool family, held-out ones included")
    p.add_argument("--runs", type=int, default=3, help="runs per case (default 3)")
    p.add_argument("--budget", type=float, default=10.0, help="spending limit in dollars (default 10)")
    p.add_argument("--out", type=Path, help="report folder (default runs/<timestamp>)")
    a = p.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Nothing was run.", file=sys.stderr)
        return 2

    from anthropic import Anthropic

    feature = FEATURES[a.feature]
    cases = load_cases(a.feature, a.families.split(",") if a.families else None, a.limit,
                       only=None if a.half == "all" else a.half)
    budget = Budget(a.budget)
    results, stopped = run_cases(feature, cases, MeteredClient(Anthropic(), budget), a.runs)
    out = a.out or HERE / "runs" / datetime.now().strftime("%Y%m%d_%H%M%S")
    write(out, feature, results, runs_per_case=a.runs, cases_planned=len(cases),
          budget=budget, stopped=stopped,
          half=None if a.families and a.half == "all" else a.half)
    print((out / "report.md").read_text())
    print(f"Written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
