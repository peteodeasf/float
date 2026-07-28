"""
Scoring: run the extractor once per case, then apply every score layer to that one
output — the four deterministic checks, the accuracy/type scorer, and the isolated
judge. Aggregates into a run report the driver consumes.
"""
import re
import checks
import accuracy
import judge as judge_mod
import config
from extractor import extract


def _stability_signature(parsed):
    """Score-relevant projection of an extraction: the things the deterministic and
    accuracy layers actually read — situation identity, fear ratings, and the
    behavior-type multiset per situation. Deliberately ignores free-text descriptions,
    which drift run-to-run even at temperature 0 without changing any score."""
    if not isinstance(parsed, dict):
        return None
    sits = []
    for s in parsed.get("situations", []):
        types = tuple(sorted(b.get("type") for b in s.get("behaviors", [])))
        name = re.sub(r"\s+", " ", (s.get("name") or "").strip().lower())
        sits.append((name, s.get("fear_rating"), s.get("fear_rating_max"), types))
    return tuple(sorted(sits))


def score_case(case, prompt):
    raw, out = extract(prompt, case["source_note"], case=case)

    # Stability check: at temperature 0 the SCORE should be reproducible. We compare
    # the score signature (names + ratings + behavior types) across runs, not raw
    # text — prose in descriptions varies harmlessly even at temp 0. STABILITY_RUNS > 1
    # re-runs and flags drift that would actually move a score.
    stability_runs = getattr(config, "STABILITY_RUNS", 1) or 1
    distinct_outputs = 1
    if stability_runs > 1:
        sigs = {_stability_signature(out)}
        for _ in range(stability_runs - 1):
            _, out_again = extract(prompt, case["source_note"], case=case)
            sigs.add(_stability_signature(out_again))
        distinct_outputs = len(sigs)
    stable = distinct_outputs == 1

    # deterministic layer (out may be None if parse failed)
    parsed_for_checks = out if isinstance(out, dict) else {"situations": []}
    det = {
        "behavior_enum": checks.check_behavior_enum(parsed_for_checks),
        "rating_integrity": checks.check_rating_integrity(parsed_for_checks, case["source_note"]),
        "no_duplicate_situations": checks.check_no_duplicate_situations(parsed_for_checks),
    }
    _, clean_fails = checks.check_clean_json(raw)
    det["clean_json"] = clean_fails
    det_pass = all(len(v) == 0 for v in det.values())

    # accuracy + judge only meaningful if we got a parse
    if out is None:
        acc = {"type_accuracy": 0.0, "situation_recall": 0.0,
               "mismatches": [], "missed_situations": [], "spurious_situations": [],
               "note": "output did not parse"}
        jdg = {"naming_ok": None, "faithful_ok": None, "issues": ["no parse"]}
    else:
        acc = accuracy.score_case(out, case)
        jdg = judge_mod.judge_case(case["source_note"], out)

    return {
        "case_id": case["case_id"],
        "parsed_ok": out is not None,
        "deterministic": det,
        "deterministic_pass": det_pass,
        "accuracy": acc,
        "judge": jdg,
        "raw": raw,
        "stable": stable,
        "distinct_outputs": distinct_outputs,
    }


def score_all(cases, prompt):
    per_case = [score_case(c, prompt) for c in cases]

    det_pass_all = all(r["deterministic_pass"] for r in per_case)
    type_acc = sum(r["accuracy"]["type_accuracy"] for r in per_case) / len(per_case)
    judge_vals = [r["judge"] for r in per_case if r["judge"].get("naming_ok") is not None]
    judge_pass = (sum(1 for j in judge_vals if j["naming_ok"] and j["faithful_ok"])
                  / len(judge_vals)) if judge_vals else None

    failures = []
    for r in per_case:
        for check, fails in r["deterministic"].items():
            for f in fails:
                failures.append({"case_id": r["case_id"], "layer": "deterministic", "check": check, "detail": f})
        for m in r["accuracy"].get("mismatches", []):
            failures.append({"case_id": r["case_id"], "layer": "type", "check": "type_mismatch", "detail": m})
        for s in r["accuracy"].get("missed_situations", []):
            failures.append({"case_id": r["case_id"], "layer": "type", "check": "missed_situation", "detail": s})
        for s in r["accuracy"].get("spurious_situations", []):
            failures.append({"case_id": r["case_id"], "layer": "type", "check": "spurious_situation", "detail": s})
        for iss in r["judge"].get("issues", []):
            failures.append({"case_id": r["case_id"], "layer": "judge", "check": "judge", "detail": iss})

    unstable_cases = [r["case_id"] for r in per_case if not r["stable"]]

    return {
        "deterministic_pass": det_pass_all,
        "type_accuracy": round(type_acc, 4),
        "judge_pass_rate": judge_pass,
        "stable": len(unstable_cases) == 0,
        "unstable_cases": unstable_cases,
        "stability_runs": getattr(config, "STABILITY_RUNS", 1),
        "failures": failures,
        "per_case": per_case,
    }
