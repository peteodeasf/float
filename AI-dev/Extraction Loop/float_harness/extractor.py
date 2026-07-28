"""
The extractor seam. extract() runs the current prompt over one source note and
returns (raw_text, parsed_dict). raw_text is what the model produced verbatim (so
the clean-JSON check can inspect it); parsed_dict is the best-effort parse used by
the accuracy and judge layers.

Run at temperature 0 (config.EXTRACTOR_TEMPERATURE) so score changes trace to your
prompt edits, not model randomness.

DRY_RUN mode echoes the fixture's expected output, letting you exercise the whole
loop with no API calls.
"""
import json
import re
import config


# Structured-output schema for the target extraction shape. Forces fence-free,
# schema-valid JSON so the clean_json / behavior_enum checks pass deterministically
# instead of depending on the model honoring a "no markdown" instruction.
# Optional fields (fear_rating, fear_rating_max, review_flag) are nullable rather
# than omitted, which strict json_schema mode requires; the checks treat null and
# absent identically.
EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "situations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "fear_rating": {"type": ["integer", "null"]},
                    "fear_rating_max": {"type": ["integer", "null"]},
                    "behaviors": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "order": {"type": "integer"},
                                "type": {"type": "string",
                                         "enum": ["avoidance", "safety", "escape", "unclear"]},
                                "description": {"type": "string"},
                            },
                            "required": ["order", "type", "description"],
                        },
                    },
                    "accommodations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {"description": {"type": "string"}},
                            "required": ["description"],
                        },
                    },
                },
                "required": ["name", "fear_rating", "fear_rating_max",
                             "behaviors", "accommodations"],
            },
        },
        "review_flag": {"type": ["boolean", "null"]},
    },
    "required": ["situations", "review_flag"],
}


def _parse(raw):
    """Best-effort parse. Tries strict JSON, then strips ``` fences as a fallback."""
    try:
        return json.loads(raw)
    except Exception:
        pass
    stripped = re.sub(r"^```[a-zA-Z]*\n?|```$", "", raw.strip()).strip()
    try:
        return json.loads(stripped)
    except Exception:
        return None


def extract(prompt, source_note, case=None):
    """
    Returns (raw_text, parsed_dict_or_None).
    `case` is only used by DRY_RUN to echo the gold answer.
    """
    if config.DRY_RUN:
        payload = {"situations": case["situations"]} if case else {"situations": []}
        raw = json.dumps(payload, ensure_ascii=False)
        return raw, _parse(raw)

    from anthropic import Anthropic
    client = Anthropic()  # reads ANTHROPIC_API_KEY
    resp = client.messages.create(
        model=config.EXTRACTOR_MODEL,
        max_tokens=config.MAX_TOKENS,
        temperature=config.EXTRACTOR_TEMPERATURE,
        system=prompt,
        messages=[{"role": "user", "content": source_note}],
        output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
    )
    raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return raw, _parse(raw)
