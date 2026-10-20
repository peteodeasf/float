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


def score(case, prepared, parsed) -> dict:
    """Counts, not ratios, so they can be added up across cases and runs with the sample size kept.

    situations       -- fact situations that appear in the log
    situations_found -- of those, how many a model situation was matched to
    behaviors        -- fact behaviors under the situations that were found
    types_right      -- of those, how many the model gave the right type (counted as a multiset
                        per situation: two safety and one escape against two safety and one
                        avoidance is two right)
    extra_behaviors  -- model behaviors beyond the fact count, under found situations
    unlinked         -- model situations that point at no entry, so nothing backs them up
    split            -- extra model situations matched to a fact situation already matched
    """
    logged = sorted({r for r in case.expected["entry_refs"] if r is not None})
    facts = case.expected["situations"]
    found: dict[str, Counter] = {}
    unlinked = split = 0
    for group in _merged(parsed):
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
        "unlinked": unlinked,
        "split": split,
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
    "Parent actions mistaken for child behaviors, and triggers the parent never logged, are not "
    "scored yet. That is the later monitoring-analysis item.",
    "Accommodations are not scored.",
    "Wording is not scored: a behavior counts as right on its type alone.",
    "`rebuild_from_monitoring` is not run against a database. Its grouping by name is repeated with "
    "the app's own `normalise_name`.",
    "The rating check counts any number in the input, dates included, so it misses a rating that "
    "matches a day of the month.",
    "The answer keys are the generating agents' labels. No clinician has checked them.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]
