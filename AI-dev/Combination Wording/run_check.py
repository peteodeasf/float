"""Draft a combination sentence for every situation + safety behaviour pair we have, for a person
to read.

    backend/.venv/bin/python "AI-dev/Combination Wording/run_check.py"

Needs ANTHROPIC_API_KEY, from the environment or backend/.env. Touches no database. Writes
results.md next to this file.

This is a reading sheet, not a scored test. Nobody has yet said what a good combination sentence
looks like beyond one example, so there is nothing to score against. Peter or Dr. Walker reads the
sheet. Plan: docs/plans/ladder-combinations.md

WHERE THE PAIRS COME FROM. The existing ladder cases in `AI-dev/Ladder Eval/`, read in place rather
than copied, plus Dr. Walker's separation-anxiety file and the worked example from the plan.
About fifteen pairs, mostly social anxiety and separation. That is a small, partial set. Do not
write new prompt rules from it, and keep these pairs out of the prompt itself (see
docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).
"""
import asyncio
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
CASES = REPO / "AI-dev" / "Ladder Eval"
OUT = HERE / "results.md"

sys.path.insert(0, str(REPO / "backend"))

SAFETY_SPELLINGS = {"safety", "safety_behavior", "safety_seeking"}

# Not in the case files as safety rows. The first is the worked example in the plan. The rest are
# Dr. Walker's own safety behaviours from AI-dev/Ladder Eval/seed/separation-anxiety.md, paired
# with the situation that file is about.
EXTRA = [
    ("Participating in class verbally", "sits at the back to avoid getting called on"),
    ("Participating in class verbally", "pretends to be busy"),
    ("Participating in class verbally", "parent talks to the teacher to ask them not to call on them"),
    ("Sleep in own room without sibling, pet or parent", "special good nights"),
    ("Sleep in own room without sibling, pet or parent", "check-ins"),
    ("Sleep in own room without sibling, pet or parent", "special lights"),
]


def pairs() -> list[tuple[str, str, str]]:
    """(situation, behaviour, where it came from), with duplicates removed."""
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str, str]] = []
    for path in sorted(CASES.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, list):
            continue
        for case in data:
            if not isinstance(case, dict):
                continue
            for rung in case.get("existing_rungs") or []:
                if not isinstance(rung, dict):
                    continue
                if (rung.get("behavior_type") or "").lower() not in SAFETY_SPELLINGS:
                    continue
                key = (case["situation"].strip(), rung["name"].strip())
                if key not in seen:
                    seen.add(key)
                    out.append((*key, path.name))
    for situation, behaviour in EXTRA:
        if (situation, behaviour) not in seen:
            seen.add((situation, behaviour))
            out.append((situation, behaviour, "plan / Dr. Walker seed"))
    return out


def _load_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    env = REPO / "backend" / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                os.environ["ANTHROPIC_API_KEY"] = line.split("=", 1)[1].strip().strip('"')


async def main() -> None:
    _load_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("No ANTHROPIC_API_KEY in the environment or backend/.env.")

    from app.services.combination_wording import draft_sentence

    rows = []
    for situation, behaviour, source in pairs():
        sentence, drafted_by = await draft_sentence(situation, behaviour)
        rows.append((situation, behaviour, sentence, drafted_by, source))
        print(f"[{drafted_by}] {sentence}")

    lines = [
        "# Combination wording — reading sheet",
        "",
        f"{len(rows)} pairs. \"template\" means the AI draft failed and the plain fallback was used.",
        "",
        "| Situation | Safety behaviour | Drafted sentence | By | Source |",
        "|---|---|---|---|---|",
    ]
    for situation, behaviour, sentence, drafted_by, source in rows:
        cells = [c.replace("|", "/") for c in (situation, behaviour, sentence, drafted_by, source)]
        lines.append("| " + " | ".join(cells) + " |")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
