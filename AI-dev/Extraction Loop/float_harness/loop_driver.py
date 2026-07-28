"""
Loop driver for the Float extraction prompt.

  load fixtures + current prompt
  repeat:
    run extractor over all fixtures, score each (deterministic + accuracy + judge)
    log the iteration
    if deterministic 100% and accuracy >= BAR  -> DONE (passed)
    if plateaued                               -> STOP (not improving)
    if max iterations                          -> STOP
    analyze failures -> reviser proposes a new prompt
    if the revision touches clinical logic     -> PAUSE for human approval
    accept prompt, continue

The fixtures never change. Only the prompt changes. The best prompt seen is saved.

Usage:
  FLOAT_DRY_RUN=1 python loop_driver.py        # plumbing check, no API calls
  python loop_driver.py                         # real run (needs ANTHROPIC_API_KEY)
  python loop_driver.py --non-interactive       # stop at clinical gate instead of prompting
"""
import json
import os
import sys
import datetime

import config
import scorer
import analyze as analyze_mod
import reviser as reviser_mod


def load_fixtures():
    return json.load(open(config.FIXTURES))["cases"]


def load_prompt():
    return open(config.PROMPT_FILE, encoding="utf-8").read()


def passed(report):
    return report["deterministic_pass"] and report["type_accuracy"] >= config.ACCURACY_BAR


def plateaued(history):
    if len(history) < config.PLATEAU_WINDOW + 1:
        return False
    window = history[-(config.PLATEAU_WINDOW + 1):]
    best_before = max(h["type_accuracy"] for h in window[:-1])
    return window[-1]["type_accuracy"] - best_before < config.PLATEAU_EPS


def log_iteration(run_dir, i, prompt, report, revision=None):
    d = os.path.join(run_dir, f"iter_{i:02d}")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "prompt.md"), "w", encoding="utf-8") as f:
        f.write(prompt)
    slim = {k: v for k, v in report.items() if k != "per_case"}
    slim["per_case"] = [{"case_id": r["case_id"], "deterministic_pass": r["deterministic_pass"],
                         "type_accuracy": r["accuracy"]["type_accuracy"], "judge": r["judge"],
                         "stable": r.get("stable", True)}
                        for r in report["per_case"]]
    with open(os.path.join(d, "report.json"), "w") as f:
        json.dump(slim, f, indent=2)
    if revision is not None:
        with open(os.path.join(d, "proposed_changes.json"), "w") as f:
            json.dump(revision.get("changes", []), f, indent=2)


def approve_clinical(revision, interactive):
    """Human gate. Returns True if the clinical change is approved."""
    print("\n*** CLINICAL-LOGIC change proposed — human approval required ***")
    for c in revision["changes"]:
        if c.get("kind") == "clinical":
            print(f"  [clinical] {c['description']}")
    if not interactive:
        print("Non-interactive mode: stopping. Review the proposed prompt, then re-run.")
        return False
    ans = input("Approve this clinical change? [y/N] ").strip().lower()
    return ans == "y"


def main():
    interactive = "--non-interactive" not in sys.argv
    cases = load_fixtures()
    prompt = load_prompt()
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join(config.RUNS_DIR, stamp + ("_dry" if config.DRY_RUN else ""))
    os.makedirs(run_dir, exist_ok=True)

    history = []          # [{iteration, type_accuracy, deterministic_pass}]
    best = {"acc": -1, "prompt": prompt, "iter": 0}

    for i in range(1, config.MAX_ITERATIONS + 1):
        print(f"\n=== iteration {i} ===")
        report = scorer.score_all(cases, prompt)
        print(f"deterministic_pass={report['deterministic_pass']}  "
              f"type_accuracy={report['type_accuracy']}  "
              f"judge_pass_rate={report['judge_pass_rate']}")

        if config.STABILITY_RUNS > 1 and not report["stable"]:
            print(f">>> WARNING: output not stable at temperature 0 over "
                  f"{config.STABILITY_RUNS} runs — cases {report['unstable_cases']}. "
                  f"Scores are unreliable until this is resolved.")

        history.append({"iteration": i, "type_accuracy": report["type_accuracy"],
                        "deterministic_pass": report["deterministic_pass"]})

        # track best (must be deterministically clean to count as a candidate)
        if report["deterministic_pass"] and report["type_accuracy"] > best["acc"]:
            best = {"acc": report["type_accuracy"], "prompt": prompt, "iter": i}

        # --- stop condition 1: passed
        if passed(report):
            log_iteration(run_dir, i, prompt, report)
            print(">>> PASSED the bar.")
            break

        # --- stop condition 2: plateau
        if plateaued(history):
            log_iteration(run_dir, i, prompt, report)
            print(">>> Plateaued — stopping.")
            break

        # --- stop condition 3: max iterations (loop bound handles this)
        if i == config.MAX_ITERATIONS:
            log_iteration(run_dir, i, prompt, report)
            print(">>> Hit max iterations.")
            break

        # otherwise: analyze -> revise
        summary = analyze_mod.analyze(report)
        revision = reviser_mod.revise_prompt(prompt, summary)
        log_iteration(run_dir, i, prompt, report, revision)

        if revision.get("parse_error"):
            print(">>> Reviser returned unparseable output — keeping the current prompt "
                  "(no edit this iteration).")

        # --- human gate on clinical changes
        if config.REQUIRE_APPROVAL_FOR_CLINICAL and revision.get("touches_clinical"):
            with open(os.path.join(run_dir, f"iter_{i:02d}", "proposed_prompt.md"), "w", encoding="utf-8") as f:
                f.write(revision["revised_prompt"])
            if not approve_clinical(revision, interactive):
                print(">>> Stopping pending human review of the clinical change.")
                break

        prompt = revision["revised_prompt"]

    # save the best prompt seen
    best_path = os.path.join(run_dir, "best_prompt.md")
    with open(best_path, "w", encoding="utf-8") as f:
        f.write(best["prompt"])
    print(f"\nBest deterministically-clean accuracy: {best['acc']} (iter {best['iter']})")
    print(f"Best prompt saved to {best_path}")
    print(f"Full run log in {run_dir}")


if __name__ == "__main__":
    main()
