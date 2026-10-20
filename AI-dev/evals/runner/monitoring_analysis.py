"""Monitoring analysis: the list of situations, behaviors and accommodations that Analyze with AI
builds from a parent's monitoring log, and that `insight_service.rebuild_from_monitoring` saves.

From the app, not copied:
  * the prompt: EXTRACTION_SYSTEM_PROMPT in backend/app/api/routers/patients.py
  * the call: insight_service.request_extraction (model, token limit, no temperature set)
  * the input: insight_service.format_entries, the same numbered text the route sends
  * reading the reply: insight_service.parse_model_json
  * which entries a situation came from: insight_service.entry_ids_by_situation
  * which names count as the same situation: insight_service.normalise_name

`rebuild_from_monitoring` itself is not run. It writes to the database, and what it does with the
reply (one row per normalised name, the entries as evidence) is repeated here with the app's own
`normalise_name`, so a situation the model names twice is scored once, as a clinician sees it.

How a model situation is matched to a fact situation: by the entries it says it came from. Each
pool log entry carries `situation_ref` (Float never sees it), so the fact situation most of a model
situation's entries are about is the one it is matched to. No fuzzy name matching.
"""
import re
import uuid
from collections import Counter
from datetime import date
from types import SimpleNamespace

import app_code  # noqa: F401  (puts backend/ on the path)

NAME = "monitoring_analysis"


def app_prompt() -> str:
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT
    return EXTRACTION_SYSTEM_PROMPT


def model() -> str:
    from app.services.insight_service import EXTRACTION_MODEL
    return EXTRACTION_MODEL


def prepare(case) -> dict:
    """The entries as the app holds them, then as the text the app sends."""
    from app.services.insight_service import format_entries

    entries = [
        SimpleNamespace(
            id=uuid.uuid4(),
            entry_date=date.fromisoformat(e["date"]),
            situation=e.get("situation"),
            child_behavior_observed=e.get("child_behavior_observed"),
            parent_response=e.get("parent_response"),
            fear_thermometer=e.get("fear_thermometer"),
            parent_words=e.get("parent_words"),
        )
        for e in case.input["monitoring_log"]
    ]
    text, by_number = format_entries(entries)
    ref_by_id = {e.id: ref for e, ref in zip(entries, case.expected["entry_refs"])}
    return {"text": text, "by_number": by_number, "ref_by_id": ref_by_id}


def call(client, prepared) -> str:
    from app.services.insight_service import request_extraction
    return request_extraction(client, app_prompt(), prepared["text"])


def read(raw: str):
    """What the app's reader makes of the reply, or None where the app would show an error."""
    from app.services.insight_service import parse_model_json
    try:
        parsed = parse_model_json(raw)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def checks(case, prepared, parsed) -> dict[str, list[str]]:
    """Pass/fail code checks, no model. Each value is the list of failures; empty means passed.

    The first three are float_harness's. The rating check compares against every number in the text
    the model was given, dates included, so it catches an invented rating but not one that happens
    to match a day of the month.
    """
    from app_code import harness_module
    harness = harness_module("checks")
    if parsed is None:
        return {"app_can_read": ["the app's reader could not read the reply"]}
    return {
        "app_can_read": [],
        "behavior_enum": harness.check_behavior_enum(parsed),
        "rating_integrity": harness.check_rating_integrity(parsed, prepared["text"]),
        "no_duplicate_situations": harness.check_no_duplicate_situations(parsed),
    }


def _merged(parsed) -> list[dict]:
    """One situation per normalised name, as rebuild_from_monitoring saves them."""
    from app.services.insight_service import normalise_name
    merged: dict[str, dict] = {}
    for s in parsed.get("situations", []) or []:
        key = normalise_name(s.get("name") or "")
        if not key:
            continue
        m = merged.setdefault(key, {"situations": [], "behaviors": []})
        m["situations"].append(s)
        m["behaviors"] += list(s.get("behaviors", []) or [])
    return list(merged.values())


def _ref_for(group, prepared):
    """The fact situation most of this group's entries are about, or None if it named no entry
    the model was given."""
    from app.services.insight_service import entry_ids_by_situation
    refs = []
    for s in group["situations"]:
        for ids in entry_ids_by_situation({"situations": [s]}, prepared["by_number"]).values():
            refs += [prepared["ref_by_id"][i] for i in ids]
    refs = [r for r in refs if r is not None]
    if not refs:
        return None
    counts = Counter(refs)
    best = max(counts.values())
    return sorted(r for r, n in counts.items() if n == best)[0]


# A behavior written with an adult as the one acting. The model is told never to turn a parent's
# action into a child behavior (EXTRACTION_SYSTEM_PROMPT, "Never convert a parent/adult action"), and
# some pool entries are built to tempt it: a parent's action written in the child's field.
# Checked on 2026-10-19: of the texts Dr. Walker confirmed in June
# (`AI-dev/Extraction Loop/float_harness/tests/fixtures.json`) it marks 0 of 42 behaviors and 34 of 34
# accommodations; of the pool's facts, 0 of 185 behaviors and 123 of 123 accommodations.
_ADULT = (r"(?:mom|mommy|mother|dad|daddy|father|parents?|step-?mom|step-?dad|grandma|grandmother|"
          r"grandpa|grandfather|nana|aunt|uncle|teachers?|coach|nurse|counselor|principal|babysitter|"
          r"nanny|caregivers?|adults?|staff|therapist|doctor)")
_ADULT_FIRST = re.compile(rf"^(?:the |her |his |their |a |an |both |one )?{_ADULT}\b(?!'s)", re.I)
# "Allowed to stay home", "Was kept home": an adult's decision with the adult left out. "Kept" and
# "let" need the "was" in front: "Kept asking if mom was up" is the child's own action.
_ADULT_LEFT_OUT = re.compile(r"^(?:(?:was|were|is|are|gets|got|being) (?:allowed|let|kept|excused)|"
                             r"allowed to|excused from)\b", re.I)


def is_parent_action(description: str) -> bool:
    """True when a behavior's description begins with an adult acting, or with something an adult
    allowed. Only the start is looked at: "Left after the dog was let out" is the child leaving."""
    text = (description or "").strip()
    return bool(_ADULT_FIRST.search(text) or _ADULT_LEFT_OUT.search(text))


def score(case, prepared, parsed) -> dict:
    """Counts, not ratios, so they can be added up across cases and runs with the sample size kept.

    situations       -- fact situations that appear in the log
    situations_found -- of those, how many a model situation was matched to
    behaviors        -- fact behaviors under the situations that were found
    types_right      -- of those, how many the model gave the right type (counted as a multiset
                        per situation: two safety and one escape against two safety and one
                        avoidance is two right)
    extra_behaviors  -- model behaviors beyond the fact count, under found situations
    model_behaviors  -- every behavior the model gave, in any situation
    parent_actions   -- of those, how many are written as an adult's action (`is_parent_action`)
    unlinked         -- model situations that point at no entry, so nothing backs them up
    split            -- extra model situations matched to a fact situation already matched
    extra_triggers   -- model situations beyond the answer key's: unlinked + split. Matching by entry
                        cannot tell an invented trigger drawn from an entry from one real trigger cut
                        in two; both are triggers the answer key does not have.
    """
    logged = sorted({r for r in case.expected["entry_refs"] if r is not None})
    facts = case.expected["situations"]
    found: dict[str, Counter] = {}
    unlinked = split = model_behaviors = parent_actions = 0
    for group in _merged(parsed):
        model_behaviors += len(group["behaviors"])
        parent_actions += sum(1 for b in group["behaviors"] if is_parent_action(b.get("description")))
        ref = _ref_for(group, prepared)
        if ref is None:
            unlinked += 1
            continue
        if ref in found:
            split += 1
        found.setdefault(ref, Counter()).update(b.get("type") for b in group["behaviors"])

    behaviors = types_right = extra = 0
    for ref, got in found.items():
        want = Counter(facts.get(ref, {}).get("behavior_types", []))
        behaviors += sum(want.values())
        types_right += sum((want & got).values())
        extra += sum((got - want).values())
    return {
        "situations": len(logged),
        "situations_found": len([r for r in logged if r in found]),
        "behaviors": behaviors,
        "types_right": types_right,
        "extra_behaviors": extra,
        "model_behaviors": model_behaviors,
        "parent_actions": parent_actions,
        "unlinked": unlinked,
        "split": split,
        "extra_triggers": unlinked + split,
        "signature": signature(found, unlinked),
    }


def signature(found: dict, unlinked: int) -> str:
    """What two runs must share to count as agreeing: the same fact situations found, with the same
    behavior types under each, and the same number of unlinked situations. Wording is ignored."""
    parts = [f"{ref}:{','.join(sorted(t or '?' for t in c.elements()))}" for ref, c in sorted(found.items())]
    return ";".join(parts) + f"|unlinked={unlinked}"


NOT_COVERED = [
    "The risk flag (`review_flag`) is not scored. What counts as a risk sign is a question for "
    "Dr. Walker (Peter, 2026-10-19).",
    "Parent actions written as child behaviors are found from the wording alone: a behavior that "
    "begins with an adult (\"Mom walks him in\") or with something allowed (\"Allowed to stay "
    "home\"). One worded as the child's action (\"Stays home\") is not caught, even when the answer "
    "key has it as the parent's. On the first real run (2026-10-19) the behaviors it flagged were "
    "read by hand; the ones it did not flag were not, so how many it misses is not known.",
    "Triggers not in the answer key are matched by log entry, so a made-up trigger drawn from an "
    "entry and a real one cut in two are counted together.",
    "Accommodations are not scored.",
    "Wording is not scored: a behavior counts as right on its type alone.",
    "`rebuild_from_monitoring` is not run against a database. Its grouping by name is repeated with "
    "the app's own `normalise_name`.",
    "The rating check counts any number in the input, dates included, so it misses a rating that "
    "matches a day of the month.",
    "The answer keys are the generating agents' labels. No clinician has checked them.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]
