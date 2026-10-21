# Suggested rungs: picking one set of limits, and what counts as a duplicate

Built 2026-10-20 (backlog: "Suggested rungs: enforce the limits in code").

## The three places disagreed, and so did the plan with itself

| | Count | Length |
|---|---|---|
| Prompt (`step_suggestion_service.py`) | 2–5 | "under about twelve words" |
| `AI-dev/Ladder Eval/checks.py` | 2–12 | 18 words |
| `docs/plans/ladder-generation.md`, section 5 | 2–5 | nothing |
| `docs/plans/ladder-generation.md`, checks table | 3–5 | nothing |

The backlog said to use the plan where they disagree. The plan disagreed with itself. Section 5 is
the one with the reasoning ("the check permits two", written after the table), so 2–5 won and the
table was corrected. The plan has no length at all. The prompt's twelve was tried as a hard limit
and dropped: it left the clinician nothing in 36 of 282 test runs, and Peter (2026-10-20) chose no
length limit for now.

To stop them drifting apart again, `checks.py` now imports the numbers from the app instead of
keeping its own.

## Why "duplicate" means the same words, not mostly the same words

`checks.py` flags two suggestions as possible duplicates when 85% of the smaller one's words are in
the other. That is fine for a warning. It is wrong for dropping something, because "Sit on the bench
with the fan" and "Sit on the bench without the fan" share every word of the first. They are
different suggestions.

So the app drops a suggestion only when its words, after small words like "the", "a" and "with" are
left out, are exactly the same as an earlier one's. "with" is a small word, but "without" is not, so
those two both survive. There is a test for exactly that pair.

## Order matters

`within_limits` drops duplicates *before* it counts to five. Done the other way round,
a duplicate in the first five would take a slot and push a real sixth suggestion out.

The floor (fewer than two shows none) is checked after all the drops, so a reply of two suggestions
where one repeats the other shows nothing.

## Testing the app's call from the runner

`suggest_steps` built its own Anthropic client inline, so the runner could not count its spending.
It is now split into `ask_claude(context, client=None)`, `read_reply` and `within_limits`, the same
pattern `monitoring_capture._ask_claude` uses. The runner (`AI-dev/evals/runner/rungs.py`) calls
each of those, so it tests the app's prompt, call, reader and limits, not a copy.

`checks.py` is loaded by file path under its own module name, because `float_harness` also has a
`checks.py` and the second import would quietly return the first.
