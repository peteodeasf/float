"""Step sentences: the one sentence Claude drafts for a combination (a situation without one safety
behavior), as `combination_wording.draft_sentence` returns it. The clinician edits it, and the child
reads what is saved. Plan: docs/plans/ladder-combinations.md, "Wording a combination".

From the app, not copied:
  * the prompt: combination_wording.SYSTEM_PROMPT
  * the input text: combination_wording.user_text
  * the call: combination_wording.ask_claude (model, token limit, effort, server-side fallback)
  * reading the reply: combination_wording.clean (the first line, quotes taken off)

The cases are a fixed set of 30 pairs, `step_sentence_set.json`, five from each kind of anxiety in
the pool's working half. `choose_set` is the rule that picked them, so nobody hand-picked the easy
ones. Run `python step_sentences.py --write-set` to rebuild the file from the pool.

**The open question** from ladder-combinations.md: should the sentence say what the child does, or
what they stop doing? It is tested, not decided. Every pair is run twice:
  * "app": the app's prompt as it is. Its example step says what the child stops ("... without
    sitting at the back").
  * "does": the same prompt with that one line changed to ask for what the child does instead.
    `DOES_LINE` is the only difference, and the variant is built from the app's prompt each time,
    so it cannot drift from it. If the app's line changes, the variant refuses to run.
Then the code counts the form of each sentence and the words it adds, and the step-sentence
reviewers judge each one. Neither result changes the app's prompt.

There is no right answer to score against, and the reviewers' verdicts on step sentences have not
been checked against any clinician's marks (`reviewers.CHECKED`).
"""
import asyncio
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import app_code
from cases import POOL, STEP_SET, half
from voice_notes import _AsyncClient, content_words

NAME = "step_sentences"
MODES = ("app", "does")
SET_SIZE_PER_KIND = 5
MAX_WORDS = 15  # the prompt: "Under about fifteen words."

# The app's line this test changes, and what it becomes for the "does" runs.
APP_LINE = ('- Write it as something to do, addressed to the child, like "Answer a question in class without\n'
            '  sitting at the back".')
DOES_LINE = ("- Write it as something to do, addressed to the child. Say what the child does in the\n"
             "  situation, not what they stop doing. Do not use the word \"without\".")

# A sentence that names what the child gives up rather than only what they do.
_STOPS = re.compile(r"\b(without|don'?t|do not|not|no|never|stop\w*|skip\w*|instead of|leave\w* behind)\b",
                    re.I)

# British words a child in the US would not read. The prompt asks for American spelling.
BRITISH = {"mum", "mummy", "behaviour", "behaviours", "colour", "favourite", "neighbour",
           "neighbours", "centre", "realise", "organise", "practise", "recognise", "apologise",
           "maths", "programme", "pyjamas", "jumper", "queue", "torch", "trainers"}


# ── The set ──────────────────────────────────────────────────────────────────

def kind(family_id: str) -> str:
    """The pool's kind of anxiety, from the family id: "fam-social-03" is "social"."""
    return family_id.split("-")[1]


def choose_set(pool: Path = POOL, per_kind: int = SET_SIZE_PER_KIND) -> list[dict]:
    """The fixed set: `per_kind` pairs from each kind of anxiety, working half only.

    Within a kind, the families take turns in id order, each giving its next pair in file order,
    until the kind has `per_kind`. Then the kinds take turns, so a run stopped by the spending limit
    part-way still has every kind in it.

    Working half only, because the step-sentence prompt may later be tuned on these. The held-out
    families' pairs are left for checking a tuned prompt.
    """
    by_kind: dict[str, list[list[dict]]] = defaultdict(list)
    for f in sorted(Path(pool).glob("*.json")):
        if half(f.stem) != "working":
            continue
        fam = json.loads(f.read_text())
        pairs = [{"family": fam["id"], "situation_ref": p["situation_ref"],
                  "behavior_ref": p["behavior_ref"]}
                 for p in fam.get("judgment", {}).get("step_sentences", [])]
        if pairs:
            by_kind[kind(fam["id"])].append(pairs)
    chosen = {}
    for k, families in sorted(by_kind.items()):
        picked, turn = [], 0
        while len(picked) < per_kind and any(families):
            fam_pairs = families[turn % len(families)]
            if fam_pairs:
                picked.append(fam_pairs.pop(0))
            turn += 1
        if len(picked) < per_kind:
            raise ValueError(f"only {len(picked)} working pairs for {k!r}; wanted {per_kind}")
        chosen[k] = picked
    return [chosen[k][i] for i in range(per_kind) for k in sorted(chosen)]


def write_set(path: Path = STEP_SET) -> None:
    path.write_text(json.dumps(choose_set(), indent=2) + "\n")


# ── The feature ──────────────────────────────────────────────────────────────

def app_prompt() -> str:
    from app.services.combination_wording import SYSTEM_PROMPT
    return SYSTEM_PROMPT


def does_prompt() -> str:
    prompt = app_prompt()
    if APP_LINE not in prompt:
        raise ValueError("the app's step-sentence prompt no longer has the line the \"does\" runs "
                         "change. Update APP_LINE in step_sentences.py to the new line.")
    return prompt.replace(APP_LINE, DOES_LINE)


def model() -> str:
    from app.services.combination_wording import MODEL
    return MODEL


def prepare(case) -> dict:
    return {"situation": case.input["situation"], "behavior": case.input["behavior"],
            "system": does_prompt() if case.expected["mode"] == "does" else app_prompt()}


def call(client, prepared) -> str:
    from app.services.combination_wording import ask_claude
    raw = asyncio.run(ask_claude(prepared["situation"], prepared["behavior"],
                                 client=_AsyncClient(client), system=prepared["system"]))
    # A refusal: the app shows its plain template instead. Recorded as an unreadable reply.
    return "" if raw is None else raw


def read(raw: str):
    """The sentence the clinician would be shown, or None where the app would fall back to its
    template."""
    from app.services.combination_wording import clean
    sentence = clean(raw or "")
    return {"sentence": sentence} if sentence else None


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text)


def names_what_stops(sentence: str) -> bool:
    return bool(_STOPS.search(sentence))


# Words the sentence's form brings in, not its content: "without" is how the app's example names
# what the child stops, and "yourself" comes from talking to the child. Left out of the added words
# so the two modes are compared on content.
FORM_WORDS = content_words("without instead yourself")


def added_words(case, sentence: str) -> list[str]:
    """Content words in the sentence that are in neither the situation nor the behavior, compared by
    spelling (`voice_notes.content_words`). A synonym counts as added."""
    given = content_words(f"{case.input['situation']} {case.input['behavior']}")
    return sorted(content_words(sentence) - given - FORM_WORDS)


def checks(case, prepared, parsed) -> dict[str, list[str]]:
    """Pass/fail code checks, no model. Each value is the list of failures; empty means passed."""
    if parsed is None:
        return {"app_can_read": ["no sentence; the app would show its template"]}
    sentence = parsed["sentence"]
    n = len(_words(sentence))
    british = sorted({w.lower() for w in _words(sentence)} & BRITISH)
    return {
        "app_can_read": [],
        f"at_most_{MAX_WORDS}_words": [f"{n} words"] if n > MAX_WORDS else [],
        "american_spelling": [f"British: {', '.join(british)}"] if british else [],
    }


METRICS = ("runs", "words", "over_max_words", "names_what_stops", "added_words", "runs_adding_words")


def score(case, prepared, parsed) -> dict:
    """Counts, kept apart by mode so the report can set "app" beside "does".

    runs              -- 1 per run, so totals say how many runs they are out of
    words             -- words in the sentence, so words/runs is the average length
    over_max_words    -- 1 when longer than the prompt's fifteen
    names_what_stops  -- 1 when the sentence names what the child gives up ("without", "don't",
                         "stop", "instead of"); 0 when it only says what they do
    added_words       -- content words in neither the situation nor the behavior
    runs_adding_words -- 1 when there is at least one

    Each is written as "<metric>_<mode>", and 0 under the other mode.
    """
    sentence = parsed["sentence"]
    added = added_words(case, sentence)
    n = len(_words(sentence))
    m = {
        "runs": 1,
        "words": n,
        "over_max_words": int(n > MAX_WORDS),
        "names_what_stops": int(names_what_stops(sentence)),
        "added_words": len(added),
        "runs_adding_words": int(bool(added)),
    }
    mode = case.expected["mode"]
    out = {f"{k}_{md}": (v if md == mode else 0) for k, v in m.items() for md in MODES}
    out.update(words=n, stops=m["names_what_stops"], added=len(added),
               # For reading by hand in outputs.jsonl. Not summed, so not in the report.
               added_list=", ".join(added),
               signature=" ".join(w.lower() for w in _words(sentence)))
    return out


def group(case_id: str) -> str:
    """The mode, for keeping the reviewers' counts apart."""
    return case_id.rsplit("/", 1)[1]


SUMMED = tuple(f"{k}_{md}" for k in METRICS for md in MODES) + ("words", "stops", "added")

_MODE_TEXT = {
    "app": "the app's prompt",
    "does": "one line changed: say what the child does",
}
SCORES = tuple(
    row
    for md in MODES
    for row in (
        (f"Runs ({_MODE_TEXT[md]})", f"runs_{md}", None),
        ("... words per sentence", f"words_{md}", f"runs_{md}"),
        (f"... runs over {MAX_WORDS} words", f"over_max_words_{md}", f"runs_{md}"),
        ("... runs naming what the child stops", f"names_what_stops_{md}", f"runs_{md}"),
        ("... runs adding a word not in the situation or behavior", f"runs_adding_words_{md}",
         f"runs_{md}"),
        ("... added words per run", f"added_words_{md}", f"runs_{md}"),
    )
)
PER_CASE = (
    ("Words", "words", None),
    ("Names what stops", "stops", None),
    ("Added words", "added", None),
)
AGREEMENT = ("Two runs agree when they give the same sentence, ignoring capitals and punctuation. "
             "Any change of wording counts as a disagreement.")


# ── The reviewers ────────────────────────────────────────────────────────────

def _reviewers_module():
    judging = str(app_code.ROOT / "AI-dev" / "evals" / "judging")
    if judging not in sys.path:
        sys.path.insert(0, judging)
    import reviewers
    return reviewers


def to_item(case, prepared, parsed) -> dict:
    return _reviewers_module().step_item(case.input["situation"], case.input["behavior"],
                                         parsed["sentence"], age=case.expected["age"])


def reviewer_hooks(client) -> list:
    """The three step-sentence reviewers (her rules, the child's safety, reads right for the age),
    in the engine's shape. Each run's sentence is reviewed, even when it repeats an earlier run's, so
    a reviewer that answers differently the second time shows up in the counts."""
    rv = _reviewers_module()
    rv.check_models()
    hooks = []
    for reviewer in rv.load_all(NAME):
        hook = rv.engine_hook(reviewer, client, to_item)
        hook.__name__ = f"{reviewer.concern} ({reviewer.model})"
        hooks.append(hook)
    return hooks


NOT_COVERED = [
    "Whether a sentence is good is the reviewers' judgment, and no clinician has checked the "
    "step-sentence reviewer against her own marks. Its verdicts are unchecked.",
    "30 pairs, 5 from each of six kinds of anxiety, all from the pool's working half. Small "
    "numbers: a difference of a few runs between \"app\" and \"does\" may be chance.",
    "Every pair is a made-up family's. No clinician has checked that each behavior is a safety "
    "behavior, or that each pair is one a therapist would make a step of.",
    "\"Names what stops\" is a word list (without, don't, not, stop, instead of...), not a reading. "
    "\"Added words\" compares spelling: a synonym or a word changed to talk to the child "
    "(\"his\" to \"your\" is ignored, \"cell\" to \"phone\" is not) counts as added.",
    "The app's call can fall back to another model when Opus refuses. Spending is counted at Opus's "
    "price either way.",
    "The worked example in ladder-combinations.md (class participation) is not in the set: the "
    "app's prompt uses it as its example, so it tests nothing. Dr. Walker's own separation pairs "
    "are not in it either; `AI-dev/Combination Wording/run_check.py` still reads them.",
    "The clinician's edit before saving is not modeled. This is the draft they start from.",
    "Every pool family is an English-speaking household in the US. No OCD presentations.",
]


if __name__ == "__main__":
    if sys.argv[1:] == ["--write-set"]:
        write_set()
        print(f"Wrote {STEP_SET}")
    else:
        sys.exit("usage: step_sentences.py --write-set")
