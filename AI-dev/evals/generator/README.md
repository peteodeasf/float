# Family generator

Writes new made-up families into the waiting pool (`AI-dev/evals/pool/families/`), the same shape
as the first 30. Plan: `docs/plans/ai-quality-testing.md`, work item 6. Meant to become the Sunday
job.

**Everything it writes is synthetic.** It reads nothing from any database.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/generator/generate.py --count 5 --budget 10

Needs `ANTHROPIC_API_KEY`. Without it, it refuses and says why.

## How a family is made

1. **Code picks the family** (`spread.py`): kind of anxiety, age, where they live, who keeps the
   log, how they write, and the child's name. Kinds go round in order, starting with whichever the
   pool has fewest of, so 5 families give one of each kind. Ages are 8 to 17. Every family lives in
   the US, because Float is US-only. Names already in the pool are not reused.
2. **First call, the facts** (`prompts.FACTS_SYSTEM`): situations with Fear Levels and feared
   outcomes, behaviors with types, accommodations. This is the answer key.
3. **Second call, the inputs** (`prompts.INPUTS_SYSTEM`): the monitoring log and voice notes,
   written from the facts in the parent's style.
4. **Code fills in the rest** (`family.py`): id, provenance, status, name and age, the risk label,
   and the step-sentence and rung cases. In all 30 hand-written families those cases follow one
   rule: one step-sentence pair per safety behavior, one rung case per situation.
5. **Checks**: the pool's `validate.py`, then the generator's own (no id used twice, every
   situation in the log, no Fear Level in the log for a situation whose Fear Level is unknown,
   dates, voice-note counts, no British spelling). If the inputs fail, the second try is told what
   failed. If that fails too, the family is not written.

The model is `claude-opus-5-5`, not the `claude-sonnet-4-6` the features run on, so the test data
is not written in the same model's habits.

## What it does not do

- **No risk signs.** The prompt says to write none, and code sets `risk.present` to false and
  `confirmed` to false. What counts as a risk sign is Dr. Walker's question (Peter, 2026-10-19).
- **No session transcripts** (Peter, 2026-10-19).
- **No edge-case families.** `fam-edge-*` were written by hand to hold specific open questions.
- **No case is quoted in its prompts,** so the model has nothing to copy.

## Spending

`--budget` is in dollars, $10 by default. Before each call the run works out the most that call
could cost (the prompt, plus a full 16,000-token answer). If that would go over the limit, it stops
and says so. After the call it adds the real cost from the API's token counts. The summary it
prints says what was spent, and holds counts and labels only, no log text.

## Tests

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/generator

They use a fake AI client and spend nothing.
