#!/usr/bin/env python
"""Aggregate a filled scoring sheet into per-criterion pass rates with 95% Wilson CIs.

Usage:
    python summarize_scores.py                 # reads outputs/scoring_sheet.csv
    python summarize_scores.py path/to.csv
"""
import csv
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUBRIC_COLUMNS = [
    "situations_clustered",
    "dt_plausible",
    "behavior_classification",
    "parental_responses",
    "treatment_targets",
    "no_fabrication",
    "overall_acceptable",
]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def summarize(rows: list[dict], label: str) -> None:
    print(f"\n=== {label} (n={len(rows)} cases) ===")
    if not rows:
        print("  (no cases)")
        return
    print(f"  {'criterion':<24} {'pass/graded':>12} {'rate':>7}   95% CI (Wilson)")
    for c in RUBRIC_COLUMNS:
        vals = [r[c].strip() for r in rows if r.get(c, "").strip() in ("0", "1")]
        n = len(vals)
        k = sum(1 for v in vals if v == "1")
        rate = (k / n) if n else 0.0
        lo, hi = wilson(k, n)
        ci = f"[{lo*100:4.0f}%, {hi*100:4.0f}%]" if n else "  (ungraded)"
        print(f"  {c:<24} {f'{k}/{n}':>12} {rate*100:6.0f}% {ci:>18}")


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "outputs" / "scoring_sheet.csv"
    if not path.exists():
        sys.exit(f"No scoring sheet at {path}. Run run_eval.py and grade it first.")
    rows = list(csv.DictReader(path.open()))

    held_out = [r for r in rows if str(r.get("held_out", "")).strip().lower() in ("true", "1", "yes")]
    in_prompt = [r for r in rows if r not in held_out]

    summarize(held_out, "HELD-OUT (measures generalization)")
    summarize(in_prompt, "IN-PROMPT exemplars (regression/sanity only — NOT accuracy evidence)")
    summarize(rows, "ALL cases")

    if not held_out:
        print("\n⚠  No held-out cases graded yet — you have no measurement of generalization.")
        print("   Add cases with held_out:true (see cases/_TEMPLATE.json and rubric.md coverage targets).")


if __name__ == "__main__":
    main()
