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
import re
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


def _voice_notes(family: dict) -> list[Case]:
    """One case per voice note. Float is given the words only; the note's `expected` and its `trap`
    (what was built in to catch it out) stay out of the input."""
    return [
        Case(
            id=f"{family['id']}/voice_notes/{n}",
            family_id=family["id"],
            feature="voice_notes",
            input={"text": note["text"]},
            expected={
                "observations": note["expected"]["observations"],
                "fear_level_said": note["expected"].get("fear_level_said"),
            },
        )
        for n, note in enumerate(family["inputs"].get("voice_notes", []), 1)
    ]


def _rungs(family: dict) -> list[Case]:
    """One case per mode for each of the family's rung cases. A situation with a feared outcome
    gives two: "with" it, and "without" (told it is not known). One with none gives one, "none".

    Float is given what the app sends: the situation, its Fear Level, the feared outcome (or not)
    and the child's behaviors as what they do to cope. The pool has no rungs on any ladder, so
    `steps` is empty.
    """
    situations = {s["id"]: s for s in family["facts"]["situations"]}
    cases = []
    for r in family["judgment"].get("rungs", []):
        s = situations[r["situation_ref"]]
        feared = (s.get("feared_outcome") or "").strip()
        base = {"situation": s["name"], "score": s.get("fear_level"), "steps": [],
                "coping": [b["text"] for b in s.get("behaviors", [])]}
        for mode in (("with", "without") if feared else ("none",)):
            cases.append(Case(
                id=f"{family['id']}/rungs/{s['id']}/{mode}",
                family_id=family["id"],
                feature="rungs",
                input={**base, "feared_outcome": feared if mode == "with" else ""},
                expected={"mode": mode},
            ))
    return cases


# Each builder turns one pool family into its cases: one for monitoring analysis (the whole log),
# one per note for voice notes, one or two per rung case for suggested rungs.
BUILDERS = {
    "monitoring_analysis": lambda family: [_monitoring_analysis(family)],
    "voice_notes": _voice_notes,
    "rungs": _rungs,
}


HALVES = ("working", "held_out")


def half(family_id: str) -> str:
    """Which half a family is in: "working" (prompts may be tuned on it) or "held_out".

    float_harness's rule: odd ids are for tuning, even ids are held out. A pool id ends in its
    number ("fam-social-03"). The pool has no split of its own yet; when a family joins the fixed set
    and its held-out half moves to `AI-dev/evals/judging/`, this is the rule that decides.
    """
    m = re.search(r"(\d+)$", family_id)
    if not m:
        raise ValueError(f"no number at the end of family id {family_id!r}, so it has no half")
    return "working" if int(m.group(1)) % 2 else "held_out"


def load_cases(feature: str, family_ids: list[str] | None = None, limit: int | None = None,
               pool: Path = POOL, only: str | None = None) -> list[Case]:
    """The pool's cases for one feature, in file-name order.

    A family can give more than one case (one per voice note), so `limit` counts families, not
    cases. `family_ids` picks families by id and fails loudly on one that does not exist, so a typo does
    not quietly shrink the sample. `only` keeps one half ("working" or "held_out"), and a family
    picked by id from the other half is refused rather than dropped. `limit` takes the first N after
    that.
    """
    if only is not None and only not in HALVES:
        raise ValueError(f"no half {only!r}; known: {HALVES}")
    if feature not in BUILDERS:
        raise ValueError(f"no cases for feature {feature!r}; known: {sorted(BUILDERS)}")
    files = sorted(Path(pool).glob("*.json"))
    if family_ids:
        by_id = {f.stem: f for f in files}
        missing = [i for i in family_ids if i not in by_id]
        if missing:
            raise ValueError(f"not in the pool: {missing}")
        files = [by_id[i] for i in family_ids]
        if only:
            other = [i for i in family_ids if half(i) != only]
            if other:
                raise ValueError(f"not in the {only} half: {other}")
    if only:
        files = [f for f in files if half(f.stem) == only]
    if limit is not None:
        files = files[:limit]
    return [case for f in files for case in BUILDERS[feature](json.loads(f.read_text()))]
