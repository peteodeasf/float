# Downward arrow — probe evaluation

Does the AI write a good next question? The question a child actually reads, in
`POST /downward-arrows/next-probe`.

## Running it

```bash
export ANTHROPIC_API_KEY=...     # lives in Railway, not in backend/.env
python "AI-dev/Arrow Eval/run_eval.py"
```

It **imports the shipped prompt** from `app.api.routers.downward_arrows` rather than keeping a
copy. The extraction harness in the next folder over made that mistake: scoring its own copy of a
prompt tells you nothing about what children are being asked.

## The cases

Five, all from one real chain (Baseball practice, 2026-08-24). Peter reviewed all 18 chains that
existed in production and kept only these; the rest were produced by an older client-side template
that pasted the child's sentence into `What will happen if... <verbatim>?`, or by the meaning-chain
wording the prompt used before 2026-08-24. Neither is a question we would want reproduced.

**This set is small and narrow.** One child, one clinician, one session. It can catch a prompt that
regresses into obvious bad behaviour — echoing verbatim, drifting off what the child said, asking
what something means about them. It **cannot** tell you the prompt generalises. Widening it needs
either more real sessions or cases written by a clinician.

## The synthetic set — `cases_draft.json`, awaiting review

Fifteen cases drafted by Claude on 2026-08-27. **Every child sentence in it is invented.** Each
carries `provenance` saying so, and lives in its own file, so it can never be mistaken for observed
data.

They are built around what each one *tests*, not around sounding realistic — a one-word answer, a
feeling rather than an event, rambling speech with filler, two fears in one sentence, a physical
symptom, a global belief, contamination and separation fears rather than only social ones, "I don't
know", a chain that has stalled, and an answer that describes avoiding rather than the outcome.

**Nine of the fifteen can be settled by the checks below. Six cannot** — they are marked
`needs_scorer`, because what they test is a judgement rather than a form:

| Case | Why the checks cannot settle it |
|---|---|
| two fears in one answer | which one it picked is a judgement |
| already at a global belief | whether to keep going or stop is clinical |
| "I don't know" | "did not invent a fear" cannot be checked by word overlap |
| stalled chain | may need a different move, not another question |
| catastrophic jump | whether it skipped ahead needs someone to read the chain |
| a plan instead of a fear | redirecting back to the outcome is a judgement |

So the draft set is partly aspirational. It is worth having now because the inputs are the hard
ones, and because a scorer written later needs cases to score.

## What is checked

`checks.py`, no model and no judgement:

| Check | Catches |
|---|---|
| `is_a_question` | a statement instead of a question |
| `is_one_question` | two questions at once |
| `is_short` | a paragraph read at a child |
| `no_meaning_probe` | "what would that mean about you?" — the wrong technique for this chain |
| `uses_their_words` | a question that drifted off what the child just said |
| `not_a_verbatim_echo` | the child's sentence pasted in rather than restated |

The last two together are what "restating" means, and each catches one way it fails: all-new words
means the question left the child's fear behind, a straight copy means nothing was understood.

The checks are unit-tested in `backend/tests/test_arrow_probe_checks.py` — in CI, no key needed —
against a real good example and the three failure modes above. If the checks are wrong the
evaluation is worthless, so they are tested even though the evaluation itself is not.

## What is NOT checked

Whether the question followed the **right** thread. Two questions can both be well-formed and only
one of them chase the actual fear. That needs a scorer with a rubric, and the rubric is a clinical
judgement — Dr. Walker's, not ours.


## Harvesting real chains

    python "AI-dev/Arrow Eval/harvest.py"

Reads the arrows in the database and turns each question/answer pair into a candidate case: what
the child had said up to that point, plus the question that was actually asked next. Candidates go
to `cases_review.json` marked `"status": "needs_review"`. Nothing is promoted automatically — a
case is worth something only once a human has said what the right question was. Read them, add a
`target_question` where the asked question was wrong, and move the keepers into `cases.json`.

Anything asked before 2026-08-24 carries `"asked_by": "the old prompt…"`. The prompt asked the
meaning question then ("what would that mean about you?"), so those questions show what the tool
used to do, not what it does now. They are still useful — as examples of what not to produce.

## Samples

    python "AI-dev/Arrow Eval/run_eval.py" cases_draft.json --samples=5

Each case is asked several times, because the model does not give the same answer twice. A single
sample cannot tell a rule the prompt reliably follows from a question it happened to produce that
once — the first multi-sample run showed 5 of 15 cases giving different questions across samples,
all of which had looked settled when asked once.
