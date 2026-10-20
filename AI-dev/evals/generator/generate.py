"""Write new made-up families into the waiting pool.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/generator/generate.py --count 5 --budget 10

Each family takes two AI calls: the facts first, then the log and voice notes written from the
facts. Every family is checked with the pool's validate.py and the generator's own checks before
it is written. A family that still fails after a second try at its inputs is not written.

Needs ANTHROPIC_API_KEY. Stops before any call that could take the spend over --budget.
See README.md beside this file.
"""
import argparse
import datetime as dt
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import family as fam  # noqa: E402
import prompts  # noqa: E402
from spread import POOL, Slot, plan  # noqa: E402

# A different model from the features under test (they run on claude-sonnet-4-6), so the test data
# is not written in the same model's habits.
MODEL = "claude-opus-5-5"
MAX_TOKENS = 16000
# Dollars per million tokens. Thinking tokens are billed as output.
PRICES = {"claude-opus-5-5": (4.00, 20.00)}
INPUT_ATTEMPTS = 2


class BudgetReached(Exception):
    pass


@dataclass
class Budget:
    """Stops before a call whose worst case would take the spend over the limit.

    The worst case is the input (counted generously at one token per three characters) plus a full
    MAX_TOKENS answer. Afterwards the real cost from the API's usage figures is what is added."""
    limit: float
    model: str = MODEL
    spent: float = 0.0
    calls: int = 0

    def _price(self) -> tuple[float, float]:
        return PRICES[self.model]

    def worst_case(self, prompt_chars: int) -> float:
        p_in, p_out = self._price()
        return (prompt_chars / 3) * p_in / 1e6 + MAX_TOKENS * p_out / 1e6

    def check(self, prompt_chars: int) -> None:
        if self.spent + self.worst_case(prompt_chars) > self.limit:
            raise BudgetReached(
                f"stopped: the next call could take the spend from ${self.spent:.2f} past the ${self.limit:.2f} limit")

    def add(self, usage) -> None:
        p_in, p_out = self._price()
        self.spent += usage.input_tokens * p_in / 1e6 + usage.output_tokens * p_out / 1e6
        self.calls += 1


def ask(client, budget: Budget, system: str, message: str) -> dict:
    """One call. Returns the parsed JSON object; raises ValueError if the reply has none."""
    budget.check(len(system) + len(message))
    response = client.messages.create(
        model=budget.model,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": message}],
    )
    budget.add(response.usage)
    if response.stop_reason == "refusal":
        raise ValueError("the model declined")
    if response.stop_reason == "max_tokens":
        raise ValueError("the reply was cut off at the token limit")
    text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
    return fam.parse_json(text)


@dataclass
class Outcome:
    slot: Slot
    family: dict | None = None
    problems: list[str] = field(default_factory=list)


def generate_one(client, budget: Budget, slot: Slot, shingles: set, provenance: str) -> Outcome:
    desc = slot.describe()
    try:
        facts = ask(client, budget, prompts.FACTS_SYSTEM, prompts.facts_message(desc))
    except ValueError as e:
        return Outcome(slot, problems=[f"facts: {e}"])
    # The trap ideas are for the inputs call; they are not part of the answer key.
    traps = facts.pop("trap_ideas", None) or []
    facts_for_inputs = json.dumps({**facts, "trap_ideas": traps}, indent=2)

    found: list[str] = []
    for _ in range(INPUT_ATTEMPTS):
        try:
            inputs = ask(client, budget, prompts.INPUTS_SYSTEM,
                         prompts.inputs_message(desc, facts_for_inputs, found or None))
        except ValueError as e:
            found = [f"inputs: {e}"]
            continue
        try:
            family = fam.assemble(slot, facts, inputs, provenance)
            found = fam.problems(family, shingles)
        except (KeyError, TypeError, AttributeError) as e:
            # validate.py assumes the basic shape (every situation has an id, and so on).
            found = [f"the reply is not shaped like a family ({type(e).__name__}: {e})"]
        if not found:
            return Outcome(slot, family=family)
    return Outcome(slot, problems=found)


def run(client, count: int, budget_limit: float, seed: int, out_dir: Path = POOL,
        today: dt.date | None = None) -> tuple[list[Outcome], Budget, str | None]:
    """Write up to `count` families into `out_dir`. Returns what happened to each, the spend, and
    why the run stopped early (None if it did not)."""
    today = today or dt.date.today()
    provenance = f"SYNTHETIC — family generator (AI-dev/evals/generator), {MODEL}, {today.isoformat()}"
    budget = Budget(limit=budget_limit)
    shingles = fam.prompt_shingles()
    outcomes: list[Outcome] = []
    stopped = None
    for slot in plan(count, seed, pool=out_dir):
        try:
            outcome = generate_one(client, budget, slot, shingles, provenance)
        except BudgetReached as e:
            stopped = str(e)
            break
        if outcome.family:
            (out_dir / f"{slot.family_id}.json").write_text(
                json.dumps(outcome.family, indent=2, ensure_ascii=False) + "\n")
        outcomes.append(outcome)
    return outcomes, budget, stopped


def summary(outcomes: list[Outcome], budget: Budget, stopped: str | None, asked: int) -> str:
    """What the run did, for the PR. Counts and labels only: no log or voice-note text."""
    written = [o for o in outcomes if o.family]
    lines = [f"Asked for {asked} families. Wrote {len(written)}. Failed {len(outcomes) - len(written)}."]
    if stopped:
        lines.append(stopped)
    lines.append(f"Spent ${budget.spent:.2f} of ${budget.limit:.2f} on {budget.calls} calls to {budget.model}.")
    for o in outcomes:
        s = o.slot
        what = f"{s.family_id}: {s.kind}, age {s.age}, {s.place}, {s.logger}"
        if o.family:
            f = o.family
            sits = f["facts"]["situations"]
            types: dict[str, int] = {}
            for st in sits:
                for b in st.get("behaviors", []):
                    types[b["type"]] = types.get(b["type"], 0) + 1
            lines.append(f"- {what}. {len(sits)} situations, behaviors {types}, "
                         f"{len(f['inputs']['monitoring_log'])} log entries, "
                         f"{len(f['inputs']['voice_notes'])} voice notes.")
        else:
            lines.append(f"- {what}. Not written: {'; '.join(o.problems)}")
    return "\n".join(lines)


def summary_json(outcomes: list[Outcome], budget: Budget, stopped: str | None, asked: int) -> dict:
    """The same summary as data, for the overnight schedule (AI-dev/evals/nightly.py). Ids and counts
    only."""
    return {
        "asked": asked,
        "written": [o.slot.family_id for o in outcomes if o.family],
        "failed": [o.slot.family_id for o in outcomes if not o.family],
        "stopped": stopped,
        "spent_usd": round(budget.spent, 4),
        "limit_usd": budget.limit,
        "calls": budget.calls,
        "model": budget.model,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--budget", type=float, default=10.0, help="dollars; the run stops before going over")
    ap.add_argument("--seed", type=int, default=None, help="default: today's date, so a rerun on the same day picks the same spread")
    ap.add_argument("--out", type=Path, default=POOL)
    ap.add_argument("--summary-json", type=Path, help="also write the summary as JSON to this file")
    args = ap.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. The generator calls the AI and cannot run without it.",
              file=sys.stderr)
        return 2
    import anthropic

    seed = args.seed if args.seed is not None else int(dt.date.today().strftime("%Y%m%d"))
    outcomes, budget, stopped = run(anthropic.Anthropic(), args.count, args.budget, seed, args.out)
    print(summary(outcomes, budget, stopped, args.count))
    if args.summary_json:
        args.summary_json.write_text(json.dumps(summary_json(outcomes, budget, stopped, args.count), indent=2) + "\n")
    return 0 if outcomes and all(o.family for o in outcomes) and not stopped else 1


if __name__ == "__main__":
    sys.exit(main())
