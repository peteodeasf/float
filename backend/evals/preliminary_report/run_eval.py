#!/usr/bin/env python
"""Run the live PRELIMINARY_REPORT_SYSTEM_PROMPT over the case fixtures and capture outputs.

Decoupled from the database: cases are JSON files, the model is called directly via the
Anthropic Messages API (no auth/server/DB needed). The prompt is imported from the app so
the eval always tracks the deployed prompt — no drift.

Usage:
    export ANTHROPIC_API_KEY=sk-...
    python run_eval.py                 # all cases
    python run_eval.py --case kemp     # one case
    python run_eval.py --model claude-sonnet-4-6

Writes per-case <name>.json + <name>.md to outputs/, and a blank outputs/scoring_sheet.csv
for the clinician rubric (see rubric.md).
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
CASES_DIR = HERE / "cases"
OUTPUTS_DIR = HERE / "outputs"
# backend/ root is three levels up: evals/preliminary_report/run_eval.py -> backend/
BACKEND_ROOT = HERE.parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

DEFAULT_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 3000

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


def load_prompt() -> str:
    try:
        from app.api.routers.patients import PRELIMINARY_REPORT_SYSTEM_PROMPT
        return PRELIMINARY_REPORT_SYSTEM_PROMPT
    except Exception as e:  # pragma: no cover
        sys.exit(
            f"Could not import PRELIMINARY_REPORT_SYSTEM_PROMPT from the app ({type(e).__name__}: {e}).\n"
            f"Run this from the backend environment (the one that runs the API)."
        )


def entries_text(case: dict) -> str:
    blocks = []
    for e in case.get("entries", []):
        dt = e.get("fear_thermometer")
        dt = dt if dt is not None else "unknown"
        blocks.append(
            f"Date: {e.get('date', 'N/A')}\n"
            f"Situation: {e.get('situation') or 'N/A'}\n"
            f"Child behavior observed: {e.get('child_behavior_observed') or 'N/A'}\n"
            f"Parent response: {e.get('parent_response') or 'N/A'}\n"
            f"Distress level: {dt}/10"
        )
    return "\n\n".join(blocks)


def call_model(prompt: str, content: str, model: str, api_key: str) -> dict:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": MAX_TOKENS,
            "system": prompt,
            "messages": [{"role": "user", "content": content}],
        },
        timeout=180,
    )
    resp.raise_for_status()
    raw = resp.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
    return json.loads(raw)


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
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Set ANTHROPIC_API_KEY in the environment first.")

    prompt = load_prompt()
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
            report = call_model(prompt, entries_text(case), args.model, api_key)
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}", flush=True)
            continue
        (OUTPUTS_DIR / f"{path.stem}.json").write_text(json.dumps(report, indent=2))
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
