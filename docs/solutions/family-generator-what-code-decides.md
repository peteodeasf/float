# The family generator: what code decides, and what the model writes

**2026-10-19.** `AI-dev/evals/generator/`, work item 6 in `docs/plans/ai-quality-testing.md`.

## Problem

A generator that asks the model for "a made-up anxious family" gets the same family back each time
it is called, and gets the fixed-rule parts of the file slightly wrong. Both show up only when the
pool is scored, long after the run.

## What was worked out

- **The spread is chosen in code, not asked for.** Kind of anxiety, age, who keeps the log,
  writing style and the child's name are picked in `spread.py` and handed to the model. The kinds go
  round starting with whichever the pool has fewest of. Names already in the pool are skipped. The
  first pool had seven repeated names across six batches, which had to be fixed by hand (#26).
- **The judgment cases follow a rule, so code writes them.** In all 30 hand-written families: one
  step-sentence pair per safety behavior, and one rung case per situation, with
  `with_feared_outcome` true exactly when the situation has a feared outcome. Checked by script
  across all 30, with no exceptions. That is a description of how the first pool was written, not a
  clinical rule.
- **The risk label is set by code, to false.** The model is told to write no risk signs, because
  what counts as one is Dr. Walker's question. Letting a generator invent them would answer that
  question with made-up data.
- **The worst-case cost is checked before each call.** Thinking tokens count as output, so a reply
  can cost up to the full `max_tokens` (16,000 tokens, about $0.32 on Opus 5.5) even when the visible
  JSON is short. The limit compares against that, not against the typical cost.
- **Retries start fresh.** When the inputs fail a check, the second call is a new request with the
  problems listed, not a follow-up turn. On Opus 5.5, sending back an earlier answer without its
  thinking blocks counts as editing history, which newer accounts reject.
- **`validate.py` checks a file path, not a dict,** so the generator writes each family to a temp
  folder to check it. It never writes into the pool until the family passes.

## Settled: US families only

The backlog item asked for families outside the US, and the first run wrote some (England, the
Philippines). Peter, 2026-10-19: Float's features are US-only, so test families outside the US test
nothing we ship. They were removed, and the generator now writes only US families. That also
settles the spelling question: American spelling everywhere.
