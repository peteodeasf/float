"""Voice notes: the observations Claude writes up from what a parent said into the app (or typed as a
quick note), as `monitoring_capture.write_up` saves them.

From the app, not copied:
  * the prompt: monitoring_capture._prompt
  * the call: monitoring_capture._ask_claude (model, token limit, no temperature set)
  * reading the reply: insight_service.parse_model_json
  * what is saved from it: monitoring_capture.observations_in, which cleans each observation and
    keeps a Fear Level only when the parent said that number as a rating (`_said_as_rating`)

`write_up_note` itself is not run. It writes to the database. What it adds on top: when nothing is
found, or the reply cannot be read, it saves the parent's words as one observation on their own.

Scored against each pool note's `expected`: how many separate moments it describes, and the Fear
Level the parent said, if any. Whether the parent's words are kept is measured by comparing words,
with no model (`content_words`).
"""
import asyncio
import re
from collections import Counter
from datetime import date

import app_code  # noqa: F401  (puts backend/ on the path)

NAME = "voice_notes"

# The day the note was recorded. The app files every observation under it, whatever the words say,
# so nothing here depends on it.
RECORDED = date(2026, 10, 1)


def app_prompt() -> str:
    from app.services.monitoring_capture import _prompt
    return _prompt()


def model() -> str:
    from app.services.monitoring_capture import WRITE_UP_MODEL
    return WRITE_UP_MODEL


def prepare(case) -> dict:
    return {"text": case.input["text"]}


class _AsyncMessages:
    """The app's call is async. This lets it run through the runner's MeteredClient, which counts
    the spending, without a second, async copy of the meter."""

    def __init__(self, client):
        self._client = client

    async def create(self, **kwargs):
        return self._client.messages.create(**kwargs)


class _AsyncClient:
    def __init__(self, client):
        self.messages = _AsyncMessages(client)


def call(client, prepared) -> str:
    from app.services.monitoring_capture import _ask_claude
    return asyncio.run(_ask_claude(app_prompt(), prepared["text"], client=_AsyncClient(client)))


def read(raw: str):
    """What the app's reader makes of the reply, or None where the app would keep the words as one
    observation and nothing else."""
    from app.services.insight_service import parse_model_json
    try:
        return parse_model_json(raw)
    except Exception:
        return None


def saved(prepared, parsed) -> list[dict]:
    from app.services.monitoring_capture import observations_in
    return observations_in(parsed, prepared["text"], RECORDED)


def _model_fears(parsed) -> list:
    found = parsed.get("observations") if isinstance(parsed, dict) else None
    return [o.get("fear") for o in found if isinstance(o, dict) and o.get("fear") is not None] \
        if isinstance(found, list) else []


def checks(case, prepared, parsed) -> dict[str, list[str]]:
    """Pass/fail code checks, no model. Each value is the list of failures; empty means passed."""
    from app.services.monitoring_capture import MAX_OBSERVATIONS
    if parsed is None:
        return {"app_can_read": ["the app's reader could not read the reply"]}
    found = parsed.get("observations") if isinstance(parsed, dict) else None
    if not isinstance(found, list):
        return {"app_can_read": [], "observations_list": ["no list of observations in the reply"]}
    kept = {o["fear_thermometer"] for o in saved(prepared, parsed) if o["fear_thermometer"] is not None}
    return {
        "app_can_read": [],
        "observations_list": [],
        "at_most_max_observations": [f"{len(found)} observations, the app keeps {MAX_OBSERVATIONS}"]
        if len(found) > MAX_OBSERVATIONS else [],
        # The app drops a Fear Level the parent did not say as a rating, so the parent never sees
        # it. A failure here is the model offering one, and the app catching it.
        "fear_said_as_rating": [f"Fear Level {f} dropped by the app" for f in _model_fears(parsed)
                                if f not in kept],
    }


# ── Words ────────────────────────────────────────────────────────────────────

# Words that carry no content of their own: pronouns (the prompt turns "he" into "she said", "my"
# into "I"), joining words, and speech fillers ("um", "like", "ok so").
_STOP = set("""
a an the and or but so if then than that this these those there here of to in on at by for with
from into onto out up down off over about as is am are was were be been being do does did doing
done have has had having it its i me my mine we us our you your he him his she her hers they them
their what which who whom when where why how all any both each few more most some such no not only
own same too very can will just would could should shall may might must also again once
um uh uhm hmm ok okay like yeah so well oh just really kind sort basically actually literally
gonna wanna gotta im ive id its thats dont didnt doesnt wasnt isnt arent werent cant couldnt
wouldnt shouldnt wont hes shes theyre youre were weve lets get got go went going said says say
am pm
""".split())

_NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12",
    "fifteen": "15", "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50",
}

# Words that name a feeling or a clinical idea. The prompt says to keep the parent's words and not
# to add, soften, explain or diagnose. One of these in an observation when the parent did not say
# it is the model describing the child in its own words. "Fear" is left out: the app's own "Fear
# Level" ("she said her Fear Level was a 6") is the parent's number, not a description.
FEELING_OR_CLINICAL = {
    "anxiety", "anxious", "panic", "panicked", "panicking", "avoid", "avoided", "avoiding",
    "avoidance", "escape", "escaped", "safety", "reassurance", "reassure", "reassured",
    "reassuring", "accommodate", "accommodated", "accommodation", "phobia", "phobic", "compulsion",
    "compulsive", "trigger", "triggered", "distress", "distressed", "dysregulated", "cope",
    "coping", "scared", "afraid", "fearful", "frightened", "terrified", "nervous",
    "worried", "worry", "upset", "overwhelmed", "uncomfortable", "embarrassed", "shy",
}


def _stem(w: str) -> str:
    """A crude stem, the same on both sides, so "hiding", "hides" and "hide" match, and so do
    "getting" and "get"."""
    if w.endswith(("ies", "ied")) and len(w) > 4:
        return w[:-3] + "y"
    for suffix in ("ing", "ed", "es", "s"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[:-len(suffix)]
            break
    if len(w) > 3 and w.endswith("e"):
        w = w[:-1]
    if len(w) > 3 and w[-1] == w[-2] and w[-1] not in "aeiouls":
        w = w[:-1]
    return w


def _tokens(text: str) -> list[str]:
    return [_NUMBER_WORDS.get(w, w) for w in re.findall(r"[a-z]+|[0-9]+", (text or "").lower().replace("'", ""))]


def content_words(text: str) -> set[str]:
    """The stems of the words that carry content."""
    stems = {_stem(w) for w in _tokens(text) if w not in _STOP}
    return stems - {_stem(w) for w in _STOP}


def _saved_text(observations) -> str:
    return " ".join(o[k] or "" for o in observations
                    for k in ("situation", "child_behavior_observed", "parent_response"))


def score(case, prepared, parsed) -> dict:
    """Counts, not ratios, so they add up across notes and runs with the sample size kept.

    notes            -- 1 per run, so totals say how many note-runs they are out of
    moments          -- separate moments the note describes, from the answer key
    observations     -- observations the app would save (empty ones dropped). 0 means nothing was
                        found, and the app saves the words on their own
    count_right      -- 1 when observations equals moments
    too_many         -- 1 when one moment was cut into more than one observation (or one was added)
    too_few          -- 1 when two moments were joined, or one was left out
    none_found       -- 1 when nothing was found in a note that has a moment in it
    fear_said        -- 1 when the parent said a Fear Level
    fear_kept        -- 1 when that number is saved on an observation
    fear_other       -- saved Fear Levels that are not the one the parent said (any, when none was)
    fear_repeated    -- extra observations carrying the said Fear Level, beyond the first
    note_words       -- content words in the note
    note_words_kept  -- of those, how many appear in what is saved
    saved_words      -- content words in what is saved
    words_added      -- of those, how many are not in the note
    feelings_added   -- of those, how many are feeling or clinical words (FEELING_OR_CLINICAL)
    """
    obs = saved(prepared, parsed)
    want, fear = case.expected["observations"], case.expected["fear_level_said"]
    fears = [o["fear_thermometer"] for o in obs if o["fear_thermometer"] is not None]
    note = content_words(prepared["text"])
    written = content_words(_saved_text(obs))
    added = written - note
    feelings = {_stem(w) for w in FEELING_OR_CLINICAL}
    return {
        "notes": 1,
        "moments": want,
        "observations": len(obs),
        "count_right": int(len(obs) == want),
        "too_many": int(len(obs) > want),
        "too_few": int(len(obs) < want),
        "none_found": int(not obs and want > 0),
        "fear_said": int(fear is not None),
        "fear_kept": int(fear is not None and fear in fears),
        "fear_other": sum(1 for f in fears if f != fear),
        "fear_repeated": max(0, fears.count(fear) - 1) if fear is not None else 0,
        "note_words": len(note),
        "note_words_kept": len(note & written),
        "saved_words": len(written),
        "words_added": len(added),
        "feelings_added": len(added & feelings),
        # Not added up; written to outputs.jsonl for reading by hand.
        "added": sorted(added),
        "signature": signature(obs),
    }


def signature(obs) -> str:
    """What two runs must share to count as agreeing: the same number of observations, with the same
    Fear Levels saved. Wording is ignored."""
    return f"observations={len(obs)}|fears={sorted(o['fear_thermometer'] for o in obs if o['fear_thermometer'] is not None)}"


# What the report adds up, and how it shows it (report.py).
SUMMED = ("notes", "moments", "observations", "count_right", "too_many", "too_few", "none_found",
          "fear_said", "fear_kept", "fear_other", "fear_repeated", "note_words", "note_words_kept",
          "saved_words", "words_added", "feelings_added")
SCORES = (
    ("Notes split into the right number of observations", "count_right", "notes"),
    ("... too many observations", "too_many", "notes"),
    ("... too few observations", "too_few", "notes"),
    ("... none found (the words are saved on their own)", "none_found", "notes"),
    ("Fear Level said and saved", "fear_kept", "fear_said"),
    ("Fear Levels saved that the parent did not say", "fear_other", None),
    ("Fear Level put on more than one observation", "fear_repeated", None),
    ("Parent's words kept", "note_words_kept", "note_words"),
    ("Words in the observations the parent did not say", "words_added", "saved_words"),
    ("... of which are feeling or clinical words", "feelings_added", None),
)
PER_CASE = (
    ("Right count", "count_right", "notes"),
    ("Fear Level saved", "fear_kept", "fear_said"),
    ("Fear Levels not said", "fear_other", None),
    ("Words kept", "note_words_kept", "note_words"),
    ("Words added", "words_added", "saved_words"),
)
AGREEMENT = ("Two runs agree when they save the same number of observations with the same Fear "
             "Levels. Wording is ignored.")


NOT_COVERED = [
    "Which situation each observation is about is not scored. The answer key names the fact "
    "situations a note is about, but an observation has no link back to them, and matching by "
    "name would be a guess.",
    "Whether the child's part and the parent's part of an observation went in the right boxes is "
    "not scored.",
    "Words are compared by spelling, after dropping small words and fillers and cutting endings "
    "(\"hiding\" and \"hides\" match). A synonym (\"car\" for \"minivan\") counts as added and the "
    "parent's word as not kept. \"Words kept\" can never reach every word, and should not: an "
    "aside that is not about the moment is rightly left out.",
    "Feeling and clinical words are a fixed list (`FEELING_OR_CLINICAL`). One not on the list is "
    "counted as an added word but not as a feeling word.",
    "Where the parent gave a range (\"a seven or eight\"), the answer key has the lower number. "
    "Saving the higher one counts as a Fear Level the parent did not say.",
    "`write_up_note` is not run against a database, so the step that saves the words on their own "
    "when nothing is found is not run. It is counted (\"none found\").",
    "The notes are written as speech-to-text would write them. Google's own mistakes are not in "
    "them, and nothing is recorded or transcribed.",
    "The answer keys are the generating agents' labels. No clinician has checked them.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]
