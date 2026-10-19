"""Check every family in the waiting pool has the right shape, and that none is copied into a prompt.

    python3 -I AI-dev/evals/pool/validate.py

Exits 1 and lists the problems if any. See README.md beside this file for the shape.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
POOL = Path(__file__).resolve().parent / "families"
TYPES = {"avoidance", "escape", "safety", "unclear"}
SPEAKERS = {"Clinician", "Child", "Parent", "Other"}

# The prompts a case must never be copied into (docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).
PROMPT_FILES = [
    "backend/app/api/routers/patients.py",
    "backend/app/services/monitoring_capture.py",
    "backend/app/services/session_recording.py",
    "backend/app/services/combination_wording.py",
    "backend/app/services/step_suggestion_service.py",
    "backend/app/api/routers/downward_arrows.py",
]
SHINGLE = 7  # words in a row that count as copied


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def shingles(text: str) -> set[tuple[str, ...]]:
    w = words(text)
    return {tuple(w[i:i + SHINGLE]) for i in range(len(w) - SHINGLE + 1)}


def check(path: Path, prompt_shingles: set) -> list[str]:
    errs: list[str] = []
    bad = lambda m: errs.append(f"{path.name}: {m}")
    try:
        f = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return [f"{path.name}: not valid JSON ({e})"]

    for k in ("id", "provenance", "status", "style", "facts", "inputs", "judgment"):
        if k not in f:
            bad(f"missing {k}")
    if errs:
        return errs
    if f["id"] != path.stem:
        bad(f"id {f['id']!r} does not match the file name")
    if f["status"] != "pool":
        bad("status must be 'pool'")

    facts = f["facts"]
    age = facts.get("child", {}).get("age")
    if not (isinstance(age, int) and 8 <= age <= 17):
        bad(f"child age {age!r}: Float's patients are 8 to 17 (Peter, 2026-10-19)")
    sits = {s["id"]: s for s in facts.get("situations", [])}
    if not sits:
        bad("no situations")
    ids = set(sits)
    for s in sits.values():
        fl = s.get("fear_level")
        if fl is not None and not (isinstance(fl, int) and 0 <= fl <= 10):
            bad(f"{s['id']}: fear_level must be 0-10 or null")
        if "feared_outcome" not in s:
            bad(f"{s['id']}: missing feared_outcome (use null if not known)")
        for b in s.get("behaviors", []):
            ids.add(b["id"])
            if b.get("type") not in TYPES:
                bad(f"{b['id']}: type {b.get('type')!r} is not one of {sorted(TYPES)}")
        for a in s.get("accommodations", []):
            ids.add(a["id"])
    if not isinstance(facts.get("risk", {}).get("present"), bool):
        bad("facts.risk.present must be true or false")

    inp = f["inputs"]
    log = inp.get("monitoring_log", [])
    if not log:
        bad("no monitoring_log entries")
    for i, e in enumerate(log, 1):
        for k in ("date", "situation", "child_behavior_observed", "parent_response", "fear_thermometer", "parent_words", "situation_ref"):
            if k not in e:
                bad(f"log entry {i}: missing {k}")
        if e.get("situation_ref") not in sits and e.get("situation_ref") is not None:
            bad(f"log entry {i}: situation_ref {e.get('situation_ref')!r} is not a situation")
    for i, n in enumerate(inp.get("voice_notes", []), 1):
        for ref in n.get("expected", {}).get("refs", []):
            if ref not in ids:
                bad(f"voice note {i}: ref {ref!r} is not in the facts")
    sess = inp.get("session")
    if sess:
        keys = {t["speaker"] for t in sess.get("turns", [])}
        if not keys:
            bad("session has no turns")
        for k, role in sess.get("true_speakers", {}).items():
            if role not in SPEAKERS:
                bad(f"session speaker {k}: {role!r} is not one of {sorted(SPEAKERS)}")
        missing = keys - set(sess.get("true_speakers", {}))
        if missing:
            bad(f"session speakers with no true role: {sorted(missing)}")
        for m in sess.get("mislabeled_turns", []):
            if not (isinstance(m, dict) and isinstance(m.get("turn"), int) and 0 <= m["turn"] < len(sess["turns"])
                    and m.get("correct") in SPEAKERS):
                bad(f"mislabeled_turns: {m!r} needs a turn number in the session and a correct role")

    j = f["judgment"]
    for p in j.get("step_sentences", []):
        s = sits.get(p.get("situation_ref"))
        if not s:
            bad(f"step_sentences: unknown situation {p.get('situation_ref')!r}")
            continue
        b = next((b for b in s.get("behaviors", []) if b["id"] == p.get("behavior_ref")), None)
        if not b or b["type"] != "safety":
            bad(f"step_sentences: {p.get('behavior_ref')!r} is not a safety behavior of {s['id']}")
    for r in j.get("rungs", []):
        if r.get("situation_ref") not in sits:
            bad(f"rungs: unknown situation {r.get('situation_ref')!r}")

    # Copied into a prompt?
    text = json.dumps(inp)
    hits = shingles(text) & prompt_shingles
    if hits:
        bad(f"shares {len(hits)} seven-word runs with a prompt, e.g. {' '.join(next(iter(hits)))!r}")
    return errs


def main() -> int:
    prompt_shingles: set = set()
    for p in PROMPT_FILES:
        fp = ROOT / p
        if fp.exists():
            prompt_shingles |= shingles(fp.read_text())
    files = sorted(POOL.glob("*.json"))
    errs = [e for p in files for e in check(p, prompt_shingles)]
    for e in errs:
        print(e)
    print(f"{len(files)} families, {len(errs)} problems")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
