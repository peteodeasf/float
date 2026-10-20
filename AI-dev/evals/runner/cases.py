"""One case format for every feature, read from the waiting pool (`AI-dev/evals/pool/README.md`).

A case is:
  id        -- "<family id>/<feature>"
  family_id -- the pool family it came from
  feature   -- which AI feature it tests
  input     -- what Float is given, and nothing else
  expected  -- the answer key the code checks score against

The split matters. Anything Float would never see (which situation a log entry is about, the
family's facts) lives only in `expected`. The risk label is left out of `expected` altogether: what
counts as a risk sign is a question for Dr. Walker (Peter, 2026-10-19), so it is not scored.
"""
import json
from dataclasses import dataclass
from pathlib import Path

POOL = Path(__file__).resolve().parents[1] / "pool" / "families"


@dataclass(frozen=True)
class Case:
    id: str
    family_id: str
    feature: str
    input: dict
    expected: dict


def _monitoring_analysis(family: dict) -> Case:
    log = family["inputs"]["monitoring_log"]
    situations = {}
    for s in family["facts"]["situations"]:
        situations[s["id"]] = {
            "fear_level": s.get("fear_level"),
            "behavior_types": [b["type"] for b in s.get("behaviors", [])],
        }
    return Case(
        id=f"{family['id']}/monitoring_analysis",
        family_id=family["id"],
        feature="monitoring_analysis",
        # Every field the app stores for an entry, and situation_ref taken out.
        input={"monitoring_log": [{k: v for k, v in e.items() if k != "situation_ref"} for e in log]},
        expected={
            "entry_refs": [e.get("situation_ref") for e in log],
            "situations": situations,
        },
    )


BUILDERS = {
    "monitoring_analysis": _monitoring_analysis,
}


def load_cases(feature: str, family_ids: list[str] | None = None, limit: int | None = None,
               pool: Path = POOL) -> list[Case]:
    """The pool's cases for one feature, in file-name order.

    `family_ids` picks families by id and fails loudly on one that does not exist, so a typo does
    not quietly shrink the sample. `limit` takes the first N after that.
    """
    if feature not in BUILDERS:
        raise ValueError(f"no cases for feature {feature!r}; known: {sorted(BUILDERS)}")
    files = sorted(Path(pool).glob("*.json"))
    if family_ids:
        by_id = {f.stem: f for f in files}
        missing = [i for i in family_ids if i not in by_id]
        if missing:
            raise ValueError(f"not in the pool: {missing}")
        files = [by_id[i] for i in family_ids]
    if limit is not None:
        files = files[:limit]
    return [BUILDERS[feature](json.loads(f.read_text())) for f in files]
