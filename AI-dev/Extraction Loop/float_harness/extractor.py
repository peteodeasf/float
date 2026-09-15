"""
The extractor seam. Runs a prompt over one case exactly the way Analyze with AI does and returns
(raw_text, parsed_dict_or_None).

Three things come from the app itself rather than being copied here, so the score describes what
clinicians get:
  * the prompt: EXTRACTION_SYSTEM_PROMPT in backend/app/api/routers/patients.py
  * the call: insight_service.request_extraction (model, token limit, no temperature set)
  * the input and the reading of the reply: insight_service.format_entries and parse_model_json

A case's note is written as "(Situation, fear 8/10) what the child did. Parent did: what the
parent did." Each of those is turned into one monitoring entry, the same fields the parent's form
fills in, and numbered the way the app numbers them.

DRY_RUN echoes the fixture's expected output, so the loop's plumbing runs with no API calls.
"""
import json
import pathlib
import re
import sys
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import config

BACKEND = pathlib.Path(__file__).resolve().parents[3] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

_HEAD = re.compile(r"\(([^()]+?),\s*fear\s*(\d+(?:\s*[-–]\s*\d+)?)\s*/\s*10\)")
_HEAD_NO_RATING = re.compile(r"^\(([^()]+)\)")


def app_prompt():
    """The prompt the app uses today."""
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT
    return EXTRACTION_SYSTEM_PROMPT


def entries_from_note(note):
    """One monitoring entry per "(Situation, fear N/10)" in the note."""
    note = note.strip()
    heads = list(_HEAD.finditer(note))
    if heads:
        parts = [(m.group(1), m.group(2), note[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(note)])
                 for i, m in enumerate(heads)]
    else:
        m = _HEAD_NO_RATING.match(note)
        if not m:
            raise ValueError(f"Note has no (Situation) heading: {note[:60]!r}")
        parts = [(m.group(1), None, note[m.end():])]

    entries = []
    for n, (situation, fear, body) in enumerate(parts):
        child, _, parent = body.partition("Parent did:")
        entries.append(SimpleNamespace(
            id=uuid.uuid4(),
            entry_date=date(2026, 6, 1) + timedelta(days=n),
            situation=situation.strip(),
            child_behavior_observed=child.strip() or None,
            parent_response=parent.strip() or None,
            # A range ("5-8") is kept as written; the parent's form takes one number, so the app
            # would never see one, but the note has it.
            fear_thermometer=re.sub(r"\s+", "", fear) if fear else None,
            parent_words=None,
        ))
    return entries


def app_input(case):
    """The text the model is given for this case, as the app would write it."""
    from app.services.insight_service import format_entries
    text, _ = format_entries(entries_from_note(case["source_note"]))
    return text


def extract(prompt, case):
    """Returns (raw_text, parsed_dict_or_None)."""
    if config.DRY_RUN:
        raw = json.dumps({"situations": case["situations"]}, ensure_ascii=False)
        return raw, json.loads(raw)

    from anthropic import Anthropic
    from app.services.insight_service import parse_model_json, request_extraction

    raw = request_extraction(Anthropic(), prompt, app_input(case))
    try:
        parsed = parse_model_json(raw)
    except Exception:
        parsed = None
    return raw, parsed if isinstance(parsed, dict) else None
