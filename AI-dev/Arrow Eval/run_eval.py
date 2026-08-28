"""Evaluate the downward-arrow probe against real chains.

    export ANTHROPIC_API_KEY=...        # not in backend/.env; the key lives in Railway
    python "AI-dev/Arrow Eval/run_eval.py"                    # the five real cases
    python "AI-dev/Arrow Eval/run_eval.py" cases_draft.json   # the synthetic set

**It imports the SHIPPED prompt** from `app.api.routers.downward_arrows` rather than keeping a
copy. The extraction harness's mistake was testing a stand-in: a harness that scores its own copy
of a prompt tells you nothing about what children are actually being asked.

Cases come from `cases.json` — real chains out of production, one case per point in each chain.
For every case the model gets the situation and everything said before, and must write the next
question. Then the deterministic checks in `checks.py` run over it.

What this does NOT judge: whether the question followed the *right* thread. Two questions can both
be well-formed and only one of them chase the actual fear. That needs a scorer, and a scorer needs
Dr. Walker to agree the rubric is right first.
"""
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / "backend"))

import checks  # noqa: E402


def load_prompt() -> str:
    from app.api.routers.downward_arrows import NEXT_PROBE_SYSTEM_PROMPT
    return NEXT_PROBE_SYSTEM_PROMPT


def build_user_message(case: dict) -> str:
    lines = [f'Starting thought: "{case["starting_thought"]}"']
    for s in case["steps_so_far"]:
        lines.append(f'Q: {s["question"]}')
        lines.append(f'A: "{s["response"]}"')
    lines.append("\nWrite the next question.")
    return "\n".join(lines)


def main() -> int:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("ANTHROPIC_API_KEY is not set. The key lives in Railway, not backend/.env.")
        print("Set it in this shell and re-run; nothing else is needed.")
        return 2

    import anthropic

    case_file = HERE / (sys.argv[1] if len(sys.argv) > 1 else "cases.json")
    cases = json.loads(case_file.read_text())
    print(f"{len(cases)} cases from {case_file.name}\n")
    prompt = load_prompt()
    client = anthropic.Anthropic(api_key=key)

    results, failures = [], []
    for i, case in enumerate(cases, 1):
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=prompt,
            messages=[{"role": "user", "content": build_user_message(case)}],
        )
        probe = msg.content[0].text.strip()
        outcome = checks.run_all(probe, case["child_last_said"])
        failed = [c for c in outcome if not c["passed"]]
        results.append({"case": case, "probe": probe, "checks": outcome})
        mark = "ok  " if not failed else "FAIL"
        print(f"{mark} [{i:>2}/{len(cases)}] {case['child_last_said'][:52]!r}")
        print(f"          -> {probe}")
        for f in failed:
            print(f"          !! {f['check']}: {f['reason']}")
            failures.append((i, f["check"]))

    total_checks = len(cases) * 6
    failed_checks = len(failures)
    print(f"\n{len(cases)} cases, {total_checks - failed_checks}/{total_checks} checks passed")
    if failures:
        by_check: dict[str, int] = {}
        for _, name in failures:
            by_check[name] = by_check.get(name, 0) + 1
        print("failures by check:")
        for name, n in sorted(by_check.items(), key=lambda x: -x[1]):
            print(f"   {name}: {n}")

    (HERE / "last_run.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nfull output -> {HERE / 'last_run.json'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
