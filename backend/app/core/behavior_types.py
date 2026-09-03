"""What `avoidance_behaviors.behavior_type` is allowed to say.

The column is a free string and had drifted to **11 values across 136 rows** in production by
2026-09-01 — `safety` / `safety_behavior` / `safety_seeking` for one idea, and six more that were
not behaviours at all. Nothing branched on it except one coloured chip in the clinician's situations
pane, so the drift caused no visible fault; it became a problem the moment the ladder needed to tell
a rung apart from a safety behaviour.

See docs/plans/exposure-ladder-sub-situations.md.
"""

#: A version of the situation, with its own fear rating. THIS is a ladder rung.
SCENARIO = "scenario"
#: Staying away from the situation.
AVOIDANCE = "avoidance"
#: What the child does so the situation feels safer while they are in it.
SAFETY = "safety"
#: A ritual. Offered in the clinician's picker; zero rows in production as of 2026-09-01.
RITUAL = "ritual"
#: Not a behaviour at all — a symptom, a thought, a distress response. Nine rows arrived this way
#: from monitoring extraction ("Complained of stomach pain", "Expressed fear of peer ridicule").
#: They are real observations in the wrong table, so they are kept and excluded from the ladder
#: rather than deleted.
OBSERVATION = "observation"

CANONICAL = {SCENARIO, AVOIDANCE, SAFETY, RITUAL, OBSERVATION}

#: Different spellings of the same idea, found in production 2026-09-01.
ALIASES = {
    "safety_behavior": SAFETY,
    "safety_seeking": SAFETY,
}

#: Values that were never behaviours. All nine rows came out of monitoring extraction.
NOT_A_BEHAVIOUR = {
    "physical_symptom",
    "cognitive",
    "anxious_cognition",
    "anxiety_response",
    "anxiety",
    "rumination",
}

#: What the ladder shows. An observation is not a step anyone can climb.
LADDER_TYPES = {SCENARIO, AVOIDANCE, SAFETY, RITUAL}


def normalise(value: str | None) -> str:
    """Fold a stored value onto the canonical set.

    Anything unrecognised becomes an observation rather than a rung: a value nobody planned for is
    far more likely to be extraction output than a step a clinician wrote, and the cost of guessing
    wrong that way is that it needs re-typing — not that a child is handed a stomach ache to face.
    """
    if not value:
        return OBSERVATION
    v = value.strip().lower()
    if v in CANONICAL:
        return v
    if v in ALIASES:
        return ALIASES[v]
    return OBSERVATION


def coerce_for_write(value: str | None) -> str:
    """The value to store for a NEW row, or refuse it.

    Deliberately stricter than `normalise` above. That one exists for historical rows, where we
    know what the odd values were and folding them is a correction. On the way in, an unrecognised
    value means a bug — and quietly turning it into an observation would take the clinician's rung
    off the ladder without saying so, which is the failure mode this repo keeps meeting.
    """
    from fastapi import HTTPException, status as http_status

    v = (value or "").strip().lower()
    if v in CANONICAL:
        return v
    if v in ALIASES:
        return ALIASES[v]
    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown behaviour type {value!r}.",
    )
