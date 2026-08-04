# Solutions — durable learnings

When you solve something non-obvious, write it down here while it's fresh. The first time
you solve a problem takes research; a good note means the next occurrence takes minutes —
and the next session (human or agent) starts smarter. This is the payoff of the whole loop.

## What's worth a note

- A bug whose root cause wasn't obvious from the symptom.
- A gotcha in the stack (a Railway/Netlify/Postgres/Alembic quirk, an SDK version trap).
- A decision and its reasoning, so it isn't re-litigated later.

Not worth a note: things the code or a one-line comment already makes obvious.

## Convention

- One file per learning: `docs/solutions/<short-slug>.md`.
- Keep it short. The shape that works:

```md
# <Problem in a sentence>

## Symptom
What you saw.

## Root cause
Why it actually happened.

## Fix
What resolved it (link the commit/files).

## How to avoid it next time
The general rule — the reusable part. This is the sentence future-you will thank you for.
```

Relationship to memory: personal auto-memory is a private scratchpad; these notes are the
**shared, committed** record. Prefer writing the durable version here and letting memory
point at it.
