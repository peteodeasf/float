#!/usr/bin/env python
"""Run Analyze with AI over the case fixtures and capture the reports.

Each case goes through the app's own code — the list call, the list, then the report call written
from it — so the report is written from the same input a clinician's would be. See app_pipeline.py.
No server or database is needed; the model is called with the app's own settings.

Usage:
    export ANTHROPIC_API_KEY=sk-...
    python run_eval.py                 # all cases
    python run_eval.py --case kemp     # one case

Two model calls per case. Writes per-case <name>.json (the list and the report) + <name>.md to
outputs/, and a blank outputs/scoring_sheet.csv for the clinician rubric (see rubric.md).
"""
import argparse
import asyncio
import csv
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES_DIR = HERE / "cases"
OUTPUTS_DIR = HERE / "outputs"

from app_pipeline import run_case  # noqa: E402  (puts backend/ on the path)

# Rubric criteria — columns in the scoring sheet (see rubric.md)
RUBRIC_COLUMNS = [
    "situations_clustered",
    "dt_plausible",
    "behavior_classification",
    "parental_responses",
    "treatment_targets",
    "no_fabrication",
    "overall_acceptable",
]


def report_to_md(case: dict, report: dict) -> str:
    lines = [f"# {case['name']} — {case.get('presentation', '')}", ""]
    lines.append(f"_held_out: {case.get('held_out')}_  ·  entries: {len(case.get('entries', []))}")
    lines.append("")
    lines.append("## Situations (sorted by DT)")
    for s in sorted(report.get("situations", []), key=lambda x: x.get("fear_thermometer", 0)):
        lines.append(f"- [{s.get('fear_thermometer')}] {s.get('name')}")
    lines.append("")
    lines.append("## Parental responses")
    for x in report.get("parental_responses", []):
        lines.append(f"- {x}")
    lines.append("")
    lines.append(f"## {report.get('safety_section_label', 'Safety & avoidance behaviors')}")
    for x in report.get("safety_behaviors", []):
        lines.append(f"- {x}")
    lines.append("")
    lines.append("## Treatment targets")
    for x in report.get("treatment_targets", []):
        lines.append(f"- {x}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", help="Run a single case by file stem (e.g. kemp).")
    args = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY in the environment first.")

    try:
        import anthropic
        import app.api.routers.patients  # noqa: F401  (the prompts run_case uses)
    except Exception as e:
        sys.exit(
            f"Could not import the app ({type(e).__name__}: {e}).\n"
            f"Run this from the backend environment (the one that runs the API)."
        )
    client = anthropic.Anthropic()
    OUTPUTS_DIR.mkdir(exist_ok=True)

    case_files = sorted(p for p in CASES_DIR.glob("*.json") if not p.stem.startswith("_"))
    if args.case:
        case_files = [p for p in case_files if p.stem == args.case]
        if not case_files:
            sys.exit(f"No case named {args.case!r} in {CASES_DIR}")

    sheet_rows = []
    for path in case_files:
        case = json.loads(path.read_text())
        print(f"→ {case['name']} ({len(case.get('entries', []))} entries)…", flush=True)
        try:
            extraction, report = asyncio.run(run_case(client, case))
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}", flush=True)
            continue
        (OUTPUTS_DIR / f"{path.stem}.json").write_text(
            json.dumps({"list": extraction, "report": report}, indent=2)
        )
        (OUTPUTS_DIR / f"{path.stem}.md").write_text(report_to_md(case, report))
        sheet_rows.append({
            "case": case["name"],
            "presentation": case.get("presentation", ""),
            "held_out": case.get("held_out", ""),
            **{c: "" for c in RUBRIC_COLUMNS},
            "fabrication_notes": "",
            "notes": "",
        })
        print(f"  wrote outputs/{path.stem}.md", flush=True)

    sheet_path = OUTPUTS_DIR / "scoring_sheet.csv"
    if not sheet_path.exists():
        with sheet_path.open("w", newline="") as f:
            w = csv.DictWriter(
                f,
                fieldnames=["case", "presentation", "held_out", *RUBRIC_COLUMNS, "fabrication_notes", "notes"],
            )
            w.writeheader()
            w.writerows(sheet_rows)
        print(f"\nBlank scoring sheet → {sheet_path}")
    else:
        print(f"\nKept existing scoring sheet (not overwriting): {sheet_path}")
    print("Score it per rubric.md, then run summarize_scores.py")


if __name__ == "__main__":
    main()
