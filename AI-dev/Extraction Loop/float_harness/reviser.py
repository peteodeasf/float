"""
The reviser — the learning step. Reads the current extraction prompt plus a summary
of what failed, and proposes an edited prompt.

THE CENTRAL INSTRUCTION: fix the general RULE, do not memorize the specific answer.
A reviser that patches "for the party case, say escape" overfits the prompt to the
test set. We want it sharpening the general avoidance/escape boundary wording so it
generalizes to notes it has never seen.

It also CLASSIFIES each change as "wording" (formatting / phrasing / examples) or
"clinical" (changes what counts as avoidance vs safety vs escape, accommodation rules,
rating rules, scope). The driver gates clinical changes for human approval.

DRY_RUN returns the prompt unchanged with a no-op change list.
"""
import json
import os
import re
import config

REVISER_SYSTEM = """You improve an extraction prompt so a model classifies parent
monitoring notes more accurately. You are given the CURRENT PROMPT and a FAILURE
SUMMARY from running it against a fixed test set.

Rules:
- Fix the GENERAL RULE that caused each failure, never hard-code the answer to a
  specific test case. Do not name or reference individual test cases in the prompt.
- Make the smallest change that addresses the failure pattern.
- Preserve everything that is working.
- For each change, classify it:
    "wording"  = phrasing, formatting, output-shape, or example tweaks
    "clinical" = anything that changes what counts as avoidance / safety / escape /
                 unclear, accommodation rules, fear-rating rules, or scope
- A human must approve clinical changes, so be explicit and conservative about them.

Return the full revised prompt in `revised_prompt` and a `changes` list, each item
classified `wording` or `clinical`."""

# Structured-output schema: forces clean, fully-escaped JSON so Opus 4.8 can't wrap
# the answer in reasoning prose or emit fences (both broke json parsing before).
REVISER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "revised_prompt": {"type": "string"},
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "description": {"type": "string"},
                    "kind": {"type": "string", "enum": ["wording", "clinical"]},
                },
                "required": ["description", "kind"],
            },
        },
    },
    "required": ["revised_prompt", "changes"],
}


def _parse(raw):
    """Best-effort parse. Returns None (never raises) so a malformed reviser
    response can't crash a long tuning run."""
    try:
        return json.loads(raw)
    except Exception:
        pass
    stripped = re.sub(r"^```[a-zA-Z]*\n?|```$", "", raw.strip()).strip()
    try:
        return json.loads(stripped)
    except Exception:
        pass
    # Fallback: extract the outermost {...} in case any prose wraps the JSON.
    if "{" in raw and "}" in raw:
        try:
            return json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
        except Exception:
            pass
    return None


def revise_prompt(current_prompt, failure_summary):
    """Returns {revised_prompt, changes:[{description, kind}], touches_clinical: bool}."""
    if config.DRY_RUN:
        return {"revised_prompt": current_prompt, "changes": [], "touches_clinical": False}

    from anthropic import Anthropic
    client = Anthropic()
    content = (f"CURRENT PROMPT:\n{current_prompt}\n\n"
               f"FAILURE SUMMARY:\n{failure_summary}")
    resp = client.messages.create(
        model=config.REVISER_MODEL,
        max_tokens=12000,  # must fit the ENTIRE revised prompt echoed back as JSON
        # No temperature: REVISER_MODEL is Opus 4.8, which removed sampling params.
        # Structured outputs forces clean, escaped JSON (Opus 4.8 with thinking off
        # otherwise wraps the answer in reasoning prose, which broke json parsing).
        system=REVISER_SYSTEM,
        messages=[{"role": "user", "content": content}],
        output_config={"format": {"type": "json_schema", "schema": REVISER_SCHEMA}},
    )
    raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    result = _parse(raw)
    if not isinstance(result, dict) or "revised_prompt" not in result:
        # Malformed reviser output — keep the current prompt unchanged rather than
        # crash the loop. Dump the raw response so the failure can be diagnosed.
        try:
            with open(os.path.join(config.HERE, "reviser_last_failure.txt"), "w", encoding="utf-8") as f:
                f.write(f"stop_reason={getattr(resp, 'stop_reason', '?')}\n\n{raw}")
        except Exception:
            pass
        return {"revised_prompt": current_prompt, "changes": [],
                "touches_clinical": False, "parse_error": True}
    result.setdefault("changes", [])
    result["touches_clinical"] = any(c.get("kind") == "clinical" for c in result.get("changes", []))
    return result
