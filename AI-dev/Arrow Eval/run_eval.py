"""Evaluate the downward-arrow probe against real chains.

    ANTHROPIC_API_KEY goes in backend/.env (gitignored) or the shell environment.
    python "AI-dev/Arrow Eval/run_eval.py"                               # real cases, 3 samples each
    python "AI-dev/Arrow Eval/run_eval.py" cases_draft.json --samples=5

Each case is asked several times. The model is not deterministic, so one sample cannot tell a rule
the prompt reliably follows from a question it happened to produce that once. A case whose samples
disagree is marked VARIES.

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
import concurrent.futures as cf
import pathlib
import re
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / "backend"))

import checks  # noqa: E402

ENV_FILE = HERE.parent.parent / "backend" / ".env"


def read_key() -> str | None:
    """Environment first, then backend/.env. That file is gitignored."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()
    if not ENV_FILE.exists():
        return None
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


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


def ask(client, prompt: str, case: dict, attempts: int = 4) -> str:
    """One probe, retrying transient network failures. A dropped connection partway
    through a run should not cost the whole run."""
    import anthropic
    for attempt in range(1, attempts + 1):
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=256,
                system=prompt,
                messages=[{"role": "user", "content": build_user_message(case)}],
                timeout=60.0,
            )
            return msg.content[0].text.strip()
        except (anthropic.APITimeoutError, anthropic.APIConnectionError, anthropic.RateLimitError) as e:
            if attempt == attempts:
                raise
            wait = 2 ** attempt
            print(f"          .. {type(e).__name__}, retrying in {wait}s ({attempt}/{attempts - 1})")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def normalise(q: str) -> str:
    """For deciding whether two samples are the same question. Punctuation and case are noise."""
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", q.lower()).split())


def matches_target(probe: str, case: dict) -> bool | None:
    """None when the case has no target yet - most of them don't."""
    target = case.get("target_question")
    if not target:
        return None
    accepted = [target] + case.get("acceptable_alternatives", [])
    return normalise(probe) in {normalise(a) for a in accepted}


def main() -> int:
    key = read_key()
    if not key:
        print("No ANTHROPIC_API_KEY found.")
        print(f"Add a line to {ENV_FILE} (gitignored):  ANTHROPIC_API_KEY=sk-ant-...")
        print("Or export it in this shell. Nothing else is needed.")
        return 2

    import anthropic

    argv = [a for a in sys.argv[1:] if not a.startswith("-")]
    samples = 3
    for a in sys.argv[1:]:
        if a.startswith("--samples="):
            samples = int(a.split("=", 1)[1])

    case_file = HERE / (argv[0] if argv else "cases.json")
    cases = json.loads(case_file.read_text())
    prompt = load_prompt()
    client = anthropic.Anthropic(api_key=key)
    print(f"{len(cases)} cases from {case_file.name}, {samples} samples each "
          f"({len(cases) * samples} calls)\n")

    # The model is not deterministic. Asking once cannot tell a rule the prompt reliably
    # follows from a question it happened to produce that time.
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(ask, client, prompt, case): (i, case, n)
            for i, case in enumerate(cases, 1)
            for n in range(samples)
        }
        got: dict[int, list[str]] = {}
        for fut in cf.as_completed(futures):
            i, _, _ = futures[fut]
            got.setdefault(i, []).append(fut.result())

    results, failures, unstable, off_target = [], [], [], []
    for i, case in enumerate(cases, 1):
        probes = got[i]
        variants: dict[str, list[str]] = {}
        for probe in probes:
            variants.setdefault(normalise(probe), []).append(probe)
        ordered = sorted(variants.values(), key=len, reverse=True)

        case_failures = []
        for probe in probes:
            for c in checks.run_all(probe, case["child_last_said"]):
                if not c["passed"]:
                    case_failures.append(c)
                    failures.append((i, c["check"]))

        on_target = [matches_target(p, case) for p in probes]
        hits = sum(1 for t in on_target if t)
        has_target = any(t is not None for t in on_target)

        results.append({
            "case": case, "probes": probes,
            "distinct": len(ordered),
            "target_hits": hits if has_target else None,
        })

        mark = "FAIL" if case_failures else ("VARIES" if len(ordered) > 1 else "ok  ")
        label = case.get("id") or f"{i}"
        print(f"{mark} [{label}] {case['child_last_said'][:50]!r}")
        for group in ordered:
            count = f"{len(group)}/{samples}" if len(ordered) > 1 else ""
            print(f"          -> {group[0]}   {count}".rstrip())
        for c in {f["check"]: f for f in case_failures}.values():
            print(f"          !! {c['check']}: {c['reason']}")
        if has_target and hits < samples:
            print(f"          ?? matches your target {hits}/{samples}: {case['target_question']}")
            off_target.append(label)
        if len(ordered) > 1:
            unstable.append(label)

    total = len(cases) * samples * 6
    print(f"\n{len(cases)} cases x {samples} samples, {total - len(failures)}/{total} checks passed")
    if failures:
        by_check: dict[str, int] = {}
        for _, name in failures:
            by_check[name] = by_check.get(name, 0) + 1
        print("failures by check:")
        for name, n in sorted(by_check.items(), key=lambda x: -x[1]):
            print(f"   {name}: {n}")
    print(f"{len(cases) - len(unstable)}/{len(cases)} cases gave the same question every time")
    if unstable:
        print(f"   varied: {', '.join(unstable)}")
    scored = [r for r in results if r["target_hits"] is not None]
    if scored:
        clean = sum(1 for r in scored if r["target_hits"] == samples)
        print(f"{clean}/{len(scored)} cases with a target matched it on every sample")
        if off_target:
            print(f"   missed or partial: {', '.join(off_target)}")

    (HERE / "last_run.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nfull output -> {HERE / 'last_run.json'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
