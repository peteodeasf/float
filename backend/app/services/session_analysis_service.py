"""Analyze session with AI: add one approved session note to the case summary.

Peter, 2026-10-21: one clinician-started action. One press does what monitoring analysis does — the
note's situations, behaviors and accommodations go on the suggestion list, and the case summary is
updated. Updated, never overwritten:

* everything already in the summary stays
* what the session adds is kept under `session_additions`, one block per note, marked with the
  session it came from
* a session that suggests an existing item is wrong adds a comment against it, never removes it
* a later monitoring re-analysis copies `session_additions` across, so it cannot drop them
* analyzing the same note again adds only what is not already there

The monitoring part of the summary is in the same dict (`situations`, `parental_responses`, ...).
It is written only by `POST /{patient_id}/monitoring/preliminary-report`.
"""
import json
import re
from datetime import datetime, timezone

from app.services.insight_service import REPORT_MODEL, normalise_name

# The same model as the monitoring case summary, so the two parts of the summary move together.
SESSION_SUMMARY_MODEL = REPORT_MODEL

LISTS = ("situations", "parental_responses", "safety_behaviors")

SESSION_SUMMARY_SYSTEM_PROMPT = """
You are a senior CBT clinician helping keep a child's anxiety case summary up to date. You are given the current case summary and one session note that the clinician wrote and approved.

Say what the session note adds to the summary. Do not rewrite the summary, and do not repeat anything already in it, even in other words.

Return:

1. situations: trigger situations the note describes that are not already in the summary. Give "fear_thermometer" only when the note states a number for that situation (0 to 10). Otherwise use null. Never estimate one.
2. parental_responses: how a parent or another adult responds to the child's anxiety, where the note describes something not already in the summary.
3. safety_behaviors: the child's safety behaviors, avoidance or escape, where the note describes something not already in the summary.
4. comments: where the note suggests an item already in the summary is wrong or needs care. "about" is that item's text exactly as it appears in the summary. "note" says plainly what the session suggests. Never ask for an item to be removed.
5. notes: other points from the session that matter for this child's treatment and fit none of the above. Keep each one short.

Use only what the note says. Do not diagnose. Use the family's plain words, not jargon. Use American spelling and words: "mom", not "mum". Any list can be empty.

Return ONLY valid JSON, no markdown fences, no other text, in exactly this shape:

{
  "situations": [{ "name": "string", "fear_thermometer": null }],
  "parental_responses": ["string"],
  "safety_behaviors": ["string"],
  "comments": [{ "about": "string", "note": "string" }],
  "notes": ["string"]
}
"""


def empty_report() -> dict:
    """A summary with no monitoring part yet: a session can be analyzed before the log is."""
    return {
        "situations": [],
        "parental_responses": [],
        "safety_behaviors": [],
        "safety_section_label": "Safety & avoidance behaviors",
        "treatment_targets": [],
    }


def _text(item) -> str:
    return item.get("name", "") if isinstance(item, dict) else str(item or "")


def all_items(report: dict, key: str) -> list:
    """One section's items: the monitoring part's, then each analyzed session's."""
    sessions = report.get("session_additions") or []
    return [*(report.get(key) or []), *(x for a in sessions for x in a.get(key) or [])]


def summary_as_text(report: dict | None) -> str:
    """The current summary, monitoring part and earlier session additions together, as the model
    reads it. Earlier sessions are included so a second session does not add the first one's
    items again."""
    report = report or {}
    lines: list[str] = []

    def section(title: str, items: list[str]) -> None:
        lines.append(f"{title}:")
        lines.extend(f"- {i}" for i in items if i)
        if not any(items):
            lines.append("- (none yet)")
        lines.append("")

    section("Situations", [
        _text(s) + (f" (fear thermometer {s['fear_thermometer']})"
                    if isinstance(s, dict) and s.get("fear_thermometer") is not None else "")
        for s in all_items(report, "situations")
    ])
    section("Parental responses", all_items(report, "parental_responses"))
    section(report.get("safety_section_label") or "Safety & avoidance behaviors",
            all_items(report, "safety_behaviors"))
    section("Treatment targets", report.get("treatment_targets") or [])
    section("Notes from earlier sessions", all_items(report, "notes"))
    return "\n".join(lines).strip()


def request_session_summary(client, report: dict | None, note_text: str) -> str:
    """Ask the model what one session note adds to the case summary. Returns its reply as text."""
    message = client.messages.create(
        model=SESSION_SUMMARY_MODEL,
        max_tokens=3000,
        system=SESSION_SUMMARY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": (
            "The current case summary:\n\n" + summary_as_text(report)
            + "\n\nThe approved session note:\n\n" + note_text
        )}],
    )
    return message.content[0].text


def _fear(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if 0 <= n <= 10 else None


def merge_session(report: dict | None, *, note_id, session_date, reply: dict) -> dict:
    """Fold what the model said one session adds into the summary, and return the new summary.

    Nothing already there is changed or removed. An item whose wording matches anything already in
    the summary — the monitoring part or any session — is skipped, so analyzing the same note twice
    adds nothing the second time. Matching is the same blunt lowercased key the suggestion list
    uses."""
    out = json.loads(json.dumps(report)) if report else empty_report()
    sessions = out.setdefault("session_additions", [])

    seen = {normalise_name(_text(i)) for key in (*LISTS, "notes") for i in all_items(out, key)}
    seen_comments = {
        (normalise_name(c.get("about", "")), normalise_name(c.get("note", "")))
        for a in sessions for c in a.get("comments", [])
    }

    block = next((a for a in sessions if a.get("session_note_id") == str(note_id)), None)
    if block is None:
        block = {"session_note_id": str(note_id), "session_date": session_date.isoformat(),
                 "situations": [], "parental_responses": [], "safety_behaviors": [],
                 "comments": [], "notes": []}
        sessions.append(block)
    block["analyzed_at"] = datetime.now(timezone.utc).isoformat()

    def add(key: str, item, text: str) -> None:
        k = normalise_name(text)
        if k and k not in seen:
            seen.add(k)
            block.setdefault(key, []).append(item)

    for s in reply.get("situations") or []:
        if isinstance(s, dict) and (s.get("name") or "").strip():
            name = s["name"].strip()
            add("situations", {"name": name, "fear_thermometer": _fear(s.get("fear_thermometer"))}, name)
    for key in ("parental_responses", "safety_behaviors", "notes"):
        for text in reply.get(key) or []:
            if isinstance(text, str) and text.strip():
                add(key, text.strip(), text)
    for c in reply.get("comments") or []:
        if not isinstance(c, dict):
            continue
        # The model sees situations with their number after them, and sometimes copies it.
        about = re.sub(r"\s*\(fear thermometer [^)]*\)\s*$", "", (c.get("about") or "").strip())
        note = (c.get("note") or "").strip()
        k = (normalise_name(about), normalise_name(note))
        if about and note and k not in seen_comments:
            seen_comments.add(k)
            block.setdefault("comments", []).append({"about": about, "note": note})
    return out


def without_session(report: dict, note_id) -> dict:
    """The summary without one note's additions, for when that note is deleted."""
    out = json.loads(json.dumps(report))
    out["session_additions"] = [
        a for a in out.get("session_additions") or [] if a.get("session_note_id") != str(note_id)
    ]
    return out
