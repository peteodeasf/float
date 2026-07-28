"""
The judge layer — the ONLY part that scores subjective quality:
  1. Are situation names in the family's own plain language (not clinical jargon)?
  2. Is each behavior description faithful to what the source note actually says?

ISOLATION IS THE WHOLE POINT. The judge is a fresh context that sees ONLY the source
note, the extracted output, and the rubric. It NEVER sees the extraction prompt being
tuned — otherwise it grades sympathetically toward that prompt's intent. The function
signature enforces this: there is no parameter for the extraction prompt.

DRY_RUN returns a perfect score so the loop's plumbing runs without API calls.
"""
import json
import re
import config

RUBRIC = """You are a clinical-language reviewer. You are given a parent's monitoring
note and structured data a system extracted from it. Judge ONLY two things:

1. NAMING: Is each situation named in the family's own everyday language, not clinical
   jargon? ("Lunchtime in the cafeteria" = good. "Social-evaluative exposure context"
   = bad.)
2. FAITHFULNESS: Does each behavior description reflect what the note actually says,
   without adding facts the parent did not report?

Do NOT judge whether the behavior TYPE label is correct — that is scored elsewhere.
Return ONLY JSON, no prose, no fences:
{"naming_ok": true/false, "faithful_ok": true/false,
 "issues": ["short specific issue", ...]}"""


def _parse(raw):
    try:
        return json.loads(raw)
    except Exception:
        stripped = re.sub(r"^```[a-zA-Z]*\n?|```$", "", raw.strip()).strip()
        try:
            return json.loads(stripped)
        except Exception:
            return {"naming_ok": None, "faithful_ok": None, "issues": ["judge output unparseable"]}


def judge_case(source_note, output):
    """Returns {naming_ok, faithful_ok, issues}. Sees no extraction prompt."""
    if config.DRY_RUN:
        return {"naming_ok": True, "faithful_ok": True, "issues": []}

    from anthropic import Anthropic
    client = Anthropic()
    content = (
        f"SOURCE NOTE:\n{source_note}\n\n"
        f"EXTRACTED OUTPUT:\n{json.dumps(output, ensure_ascii=False, indent=2)}"
    )
    resp = client.messages.create(
        model=config.JUDGE_MODEL,
        max_tokens=600,
        temperature=0,
        system=RUBRIC,
        messages=[{"role": "user", "content": content}],
    )
    raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return _parse(raw)
