"""Decide what each new family should be before any AI call: kind of anxiety, age, where the
family lives (always the US), who keeps the log, how they write, and the child's name.

Doing this in code, not in the prompt, is what spreads the pool. Left to itself a model writes the
same family again: a US mom, social anxiety, a 12-year-old called Emma.
"""
import json
import random
from dataclasses import dataclass
from pathlib import Path

POOL = Path(__file__).resolve().parents[1] / "pool" / "families"

# The five kinds in the backlog item. `fam-edge-*` families exist too; they are written by hand.
KINDS = {
    "social": "social anxiety",
    "separation": "separation anxiety",
    "health": "health anxiety or fear of body sensations",
    "specific": "a specific fear (an animal, the dark, needles, heights, storms, vomiting, and so on)",
    "school": "school refusal or general worry",
}

AGES = list(range(8, 18))  # Float's patients are 8 to 17 (Peter, 2026-10-19)

# Float is for families in the US only (Peter, 2026-10-19), so every family lives in the US. The
# spread comes from the kind of anxiety, age, household and writing style instead.
US_NAMES = [
    "Marcus", "Jada", "Ethan", "Sofia", "Dylan", "Maya", "Caleb", "Nora", "Isaiah", "Lucy",
    "Tyler", "Zoe", "Andre", "Hazel", "Owen", "Gianna", "Malik", "Paige", "Wyatt", "Esme",
    "Mateo", "Camila", "Darius", "Imani", "Logan", "Priya", "Elijah", "Aaliyah", "Connor", "Mei",
    "Jayden", "Valeria", "Gavin", "Nevaeh", "Rohan", "Brooke", "Xavier", "Leah", "Colton", "Amira",
    "Diego", "Harper", "Jamal", "Ruby", "Bennett", "Kiara", "Hudson", "Ximena", "Trevon", "Ivy",
]

LOGGERS = [
    "mom, two-parent household",
    "dad, two-parent household",
    "single mom",
    "single dad",
    "grandmother raising the child",
    "two moms, one of whom keeps the log",
    "parents who share custody across two homes; the parent with the child that week logs",
    "stepdad who has recently started keeping the log",
    "foster parent who has had the child for a few months",
    "mom in a multigenerational household where a grandparent often does the school run",
    "aunt who is the child's guardian",
]

STYLES = [
    "terse: two to six words per field, no punctuation to speak of",
    "rambling: long entries full of backstory and asides",
    "misspelled: types fast on a phone, frequent typos, no capitals",
    "out of order: entries written days late and not in date order, sometimes says so",
    "clinical: labels and shorthand, as if writing a report",
    "warm and worried: full sentences, apologizes, second-guesses what they did",
    "frustrated: blames the school or the other parent, impatient with the child",
    "logs mostly what the parent did, very little of what the child did",
    "quotes the child word for word, in quotation marks",
    "writes fear as a range or a word ('6 or 7', 'pretty high') instead of one number",
    "bullet points with dashes, clock times, minutes counted",
    "dictates into the phone and leaves the speech-to-text mistakes in",
]


@dataclass(frozen=True)
class Slot:
    family_id: str
    kind: str
    age: int
    place: str  # always "the US"
    logger: str
    style: str
    name: str

    def describe(self) -> str:
        """What the facts prompt is told about this family."""
        return json.dumps({
            "kind_of_anxiety": KINDS[self.kind],
            "child_name": self.name,
            "child_age": self.age,
            "where_the_family_lives": self.place,
            "who_keeps_the_log": self.logger,
            "how_the_log_is_written": self.style,
        }, indent=2)


def existing(pool: Path = POOL) -> tuple[dict[str, int], set[str], set[str]]:
    """How many families of each kind are in the pool, the highest number used per kind, and the
    child names already taken."""
    counts = {k: 0 for k in KINDS}
    top: dict[str, int] = {}
    names: set[str] = set()
    for p in pool.glob("fam-*.json"):
        _, kind, num = p.stem.split("-", 2)
        if kind in counts:
            counts[kind] += 1
        if num.isdigit():
            top[kind] = max(top.get(kind, 0), int(num))
        try:
            names.add(json.loads(p.read_text())["facts"]["child"]["name"])
        except (KeyError, json.JSONDecodeError):
            pass
    return counts, top, names


def plan(count: int, seed: int, pool: Path = POOL) -> list[Slot]:
    """`count` slots, spread across the five kinds and ages 8-17, all in the US.

    Kinds go round in order, starting with whichever the pool has fewest of, so a run of 5 gives
    one of each. Names are never reused within the pool."""
    rng = random.Random(seed)
    counts, top, used_names = existing(pool)
    kinds = sorted(KINDS, key=lambda k: (counts[k], list(KINDS).index(k)))
    ages = AGES[:]
    rng.shuffle(ages)
    loggers = LOGGERS[:]
    rng.shuffle(loggers)
    styles = STYLES[:]
    rng.shuffle(styles)

    slots = []
    for i in range(count):
        kind = kinds[i % len(kinds)]
        top[kind] = top.get(kind, 0) + 1
        place = "the US"
        free = [n for n in US_NAMES if n not in used_names]
        if not free:
            raise ValueError("every name on the lists is taken; add more names to spread.py")
        name = rng.choice(free)
        used_names.add(name)
        slots.append(Slot(
            family_id=f"fam-{kind}-{top[kind]:02d}",
            kind=kind,
            age=ages[i % len(ages)],
            place=place,
            logger=loggers[i % len(loggers)],
            style=styles[i % len(styles)],
            name=name,
        ))
    return slots
