# The waiting pool

Made-up families, written to test Float's AI features. Plan: `docs/plans/ai-quality-testing.md`.

**Everything here is synthetic.** No real child, parent or session. Nothing was read from any database.

**Waiting pool means not yet a test.** Peter looks at a case before it joins the fixed test set. When
it joins, it is split into working or held-out, and held-out cases move to `AI-dev/evals/judging/`.

## What's in the first pool (2026-10-19)

30 families, written by six generating agents in parallel, five per kind of anxiety:
- social anxiety
- separation anxiety
- health anxiety and fear of body sensations
- specific fears
- school refusal and general worry
- hard edge cases

The children are ages 8 to 17. That is Float's age range (Peter, 2026-10-19), and `validate.py` refuses any other.

| | Count |
|---|---|
| Situations | 95 (27 with no Fear Level, 37 with no feared outcome) |
| Behaviors | 170: 81 safety, 40 avoidance, 26 escape, 23 unclear |
| Accommodations | 109 |
| Log entries | 222 |
| Voice notes | 50 |
| Step-sentence pairs | 81 |
| Rung cases | 95 |
| Families with a risk sign | 2 (`fam-school-04`, `fam-edge-04`), unconfirmed and not scored |

Some entries carry a `trap` field, and the edge cases carry `difficulty` and `label_notes`. These name
something built in on purpose:
- a parent's action written in the child's field
- a number that isn't a Fear Level ("at 8:15", "three dogs")
- two situations that sound alike
- a situation mentioned only once

**No session transcripts.** Peter, 2026-10-19: made-up sessions could mislead, because we don't yet
know what a typical session looks like. Each family first had one, and they were taken out. Anything
the answer key took only from a session was moved into the log, or the fact was removed. `validate.py`
refuses a session transcript.

**What the pool doesn't cover yet:**
- Session drafts and session suggestions, since there are no sessions (see above).
- No OCD presentations, since that is out of scope for the extractor.
- Every family is a two-parent or single-parent English-speaking household in the US.
- The answer keys are the generating agents' own labels. No clinician has checked them. Where a label is an open clinical question (`fam-edge-03`), `label_notes` says so.

## Reading the families

The JSON files are hard to read. To see them as a page:

    python3 -I AI-dev/evals/pool/viewer.py families.html

The page shows each family's facts, log and voice notes.

## One file per family

`families/<id>.json`. The shape is checked by `validate.py`:

    python3 -I AI-dev/evals/pool/validate.py

### `facts`: the answer key, written first

```json
{
  "child": {"name": "Ava", "age": 9},
  "anxiety": "separation",
  "situations": [
    {
      "id": "s1",
      "name": "Being dropped off at school",
      "fear_level": 7,
      "feared_outcome": "Mom will be in a car crash and not come back",
      "behaviors": [
        {"id": "b1", "type": "safety", "text": "Holds mom's hand all the way to the classroom door"},
        {"id": "b2", "type": "avoidance", "text": "Says her stomach hurts and stays home"}
      ],
      "accommodations": [
        {"id": "a1", "text": "Mom walks her into the building"}
      ]
    }
  ],
  "risk": {"present": false, "detail": ""}
}
```

- `type` is one of `avoidance`, `escape`, `safety`, `unclear`. The definitions are the ones Dr. Walker
  confirmed (`AI-dev/Extraction Loop/float_harness/tests/fixtures.json`, `taxonomy`):
  - avoidance: the child does not enter the situation
  - escape: the child was in it and leaves when anxiety spikes
  - safety: the child stays but does something to feel safer, including seeking reassurance and keeping a parent close
  - unclear: the note doesn't say enough to classify
- `fear_level` is 0–10, or `null` if the parent never gives a number.
- `feared_outcome` is what the child fears will happen, or `null` if not known. Some are left `null` on purpose.
- `risk.present` is the generating agent's guess at whether the inputs contain a reason a clinician should look now. `detail` says what.
- `risk.confirmed` is false in every family, and the risk flag is **not scored**. Peter, 2026-10-19: what counts as a risk sign is a clinical question, and made-up data shouldn't settle it. It is on Dr. Walker's list. The two families with a risk sign stay in the pool, because everything else in them is still tested.

### `inputs`: what Float is given, written from the facts

**`monitoring_log`**: the parent's entries, in the fields the app stores (`backend/app/models/monitoring.py`).
- Each entry has `date`, `situation`, `child_behavior_observed`, `parent_response`, `fear_thermometer` (number or null), `parent_words` (null unless the entry is words only) and `situation_ref`.
- `situation_ref` is the fact situation the entry is about. Float never sees it.

**`voice_notes`**: what a parent said into the app, as speech-to-text would write it, unpunctuated.
- Each note has `text` and `expected`.
- `expected` is `{"refs": [fact ids], "observations": n, "fear_level_said": n or null}`. `observations` is how many separate moments the note describes. `fear_level_said` is the Fear Level the parent said out loud, if any.

### `judgment`: cases for the reviewing agents, taken from the facts

- **`step_sentences`**: `{situation_ref, behavior_ref}` pairs, one per safety behavior.
- **`rungs`**: `{situation_ref, with_feared_outcome: true|false}`, to test suggestions with and without a feared outcome.

There are no target answers here. The reviewing agents judge these.

### Other fields

- `id`, `provenance` (who wrote it and when), `status` (`pool`), `style` (how the parent writes).
