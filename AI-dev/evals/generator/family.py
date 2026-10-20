"""Turn the model's two answers into a pool family, and check it.

The model writes the facts and the inputs. Code writes everything that follows a fixed rule: the
id, provenance, status, the child's name and age, the unconfirmed risk label, and the judgment
cases. In all 30 hand-written families the judgment cases follow one rule: one step-sentence pair
per safety behavior, and one rung case per situation, with a feared outcome if the situation has
one.
"""
import importlib.util
import json
import re
import tempfile
from pathlib import Path

from spread import Slot

POOL_DIR = Path(__file__).resolve().parents[1] / "pool"


def _load_validate():
    spec = importlib.util.spec_from_file_location("pool_validate", POOL_DIR / "validate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


validate = _load_validate()

# British spellings a parent's log is likely to contain. The pool is American spelling throughout
# (and so is everything users see), so a family that has one of these is sent back.
BRITISH = [
    "mum", "mummy", "mums", "behaviour", "behaviours", "colour", "colours", "favourite", "realise",
    "realised", "organise", "organised", "apologise", "apologised", "recognise", "centre", "theatre",
    "neighbour", "neighbours", "programme", "travelled", "cancelled", "practise", "practised",
    "nappy", "jumper", "maths", "rubbish", "tyre", "pyjamas", "grey", "aeroplane", "learnt",
    "dreamt", "whilst", "amongst",
]
_BRITISH_RE = re.compile(r"\b(" + "|".join(BRITISH) + r")\b", re.I)
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_json(raw: str) -> dict:
    """The model is asked for bare JSON. It sometimes wraps it in a fenced block or writes a line
    first; read the object either way. Raises ValueError when there is none."""
    text = (raw or "").strip()
    fenced = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("no JSON object in the reply")
        try:
            out = json.loads(text[start:end + 1])
        except json.JSONDecodeError as e:
            raise ValueError(f"reply is not valid JSON ({e})")
    if not isinstance(out, dict):
        raise ValueError("reply is not a JSON object")
    return out


def judgment_for(situations: list[dict]) -> dict:
    return {
        "step_sentences": [
            {"situation_ref": s["id"], "behavior_ref": b["id"]}
            for s in situations for b in s.get("behaviors", []) if b.get("type") == "safety"
        ],
        "rungs": [
            {"situation_ref": s["id"], "with_feared_outcome": s.get("feared_outcome") is not None}
            for s in situations
        ],
    }


def assemble(slot: Slot, facts_reply: dict, inputs_reply: dict, provenance: str) -> dict:
    situations = facts_reply.get("situations") or []
    notes = []
    for n in inputs_reply.get("voice_notes") or []:
        note = {"text": n.get("text", ""), "expected": n.get("expected", {})}
        if n.get("trap"):
            note["trap"] = n["trap"]
        notes.append(note)
    return {
        "id": slot.family_id,
        "provenance": provenance,
        "status": "pool",
        "style": f"{slot.logger}, {slot.place}; {slot.style}",
        "facts": {
            "child": {"name": slot.name, "age": slot.age},
            "anxiety": facts_reply.get("anxiety") or slot.kind,
            "situations": situations,
            # Peter, 2026-10-19: what counts as a risk sign is a clinical question for Dr. Walker.
            # The generator is told to write none, so no made-up family answers that question.
            "risk": {"present": False, "detail": "", "confirmed": False},
        },
        "inputs": {
            "monitoring_log": inputs_reply.get("monitoring_log") or [],
            "voice_notes": notes,
        },
        "judgment": judgment_for(situations),
    }


def extra_problems(family: dict) -> list[str]:
    """Checks beyond validate.py's shape check, for mistakes a generating model makes."""
    errs: list[str] = []
    sits = family["facts"]["situations"]
    seen: set[str] = set()
    for s in sits:
        for item in [s, *s.get("behaviors", []), *s.get("accommodations", [])]:
            if item.get("id") in seen:
                errs.append(f"id {item.get('id')!r} is used twice")
            seen.add(item.get("id"))
        if not s.get("behaviors"):
            errs.append(f"{s.get('id')}: no behaviors")

    log = family["inputs"]["monitoring_log"]
    for i, e in enumerate(log, 1):
        if not _DATE_RE.match(str(e.get("date", ""))):
            errs.append(f"log entry {i}: date {e.get('date')!r} is not YYYY-MM-DD")
        ft = e.get("fear_thermometer")
        if ft is not None and not (isinstance(ft, int) and 0 <= ft <= 10):
            errs.append(f"log entry {i}: fear_thermometer {ft!r} must be 0-10 or null")
    by_id = {s.get("id"): s for s in sits}
    logged = {e.get("situation_ref") for e in log}
    for sid, s in by_id.items():
        if sid not in logged:
            errs.append(f"{sid}: no log entry is about this situation")
        if s.get("fear_level") is None:
            numbered = [i for i, e in enumerate(log, 1)
                        if e.get("situation_ref") == sid and e.get("fear_thermometer") is not None]
            if numbered:
                errs.append(f"{sid}: fear_level is null but log entries {numbered} give a number")

    for i, n in enumerate(family["inputs"]["voice_notes"], 1):
        obs = n.get("expected", {}).get("observations")
        if not (isinstance(obs, int) and obs >= 1):
            errs.append(f"voice note {i}: expected.observations must be a whole number of at least 1")
        if not n.get("text"):
            errs.append(f"voice note {i}: no text")

    found = sorted({m.group(1).lower() for m in _BRITISH_RE.finditer(
        json.dumps([family["facts"], family["inputs"]]))})
    if found:
        errs.append(f"British spelling: {', '.join(found)} (use American spelling)")
    return errs


def problems(family: dict, prompt_shingles: set) -> list[str]:
    """Everything wrong with a family: validate.py's checks first, then the generator's own."""
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / f"{family['id']}.json"
        path.write_text(json.dumps(family))
        errs = [e.removeprefix(f"{path.name}: ") for e in validate.check(path, prompt_shingles)]
    if errs:
        return errs  # the shape is wrong; the checks below would fail on missing keys
    return extra_problems(family)


def prompt_shingles() -> set:
    out: set = set()
    for p in validate.PROMPT_FILES:
        fp = validate.ROOT / p
        if fp.exists():
            out |= validate.shingles(fp.read_text())
    return out
