# Scoring voice notes: an async app call, and scoring what is saved

Found while wiring voice notes into `AI-dev/evals/runner/` (2026-10-19).

## The app's call is async and builds its own client

`monitoring_capture._ask_claude` made its own `anthropic.AsyncAnthropic()`, so the runner had no way
to count what each call cost. Two things were needed:

- `_ask_claude` takes an optional `client`. The app never passes one; the backend tests' fake still
  has the old two-argument shape and still works, because `write_up` does not pass it either.
- The runner wraps its synchronous `MeteredClient` in a small object with an `async create`
  (`voice_notes._AsyncClient`) and runs the call with `asyncio.run`. Not an async copy of the meter:
  `judging/run_held_out.py` builds a synchronous `MeteredClient` for every feature, so a feature that
  needed an async one would break the held-out run.

## Score what the app saves, not the model's reply

`write_up` drops a Fear Level the parent did not say as a rating, and drops empty observations.
Scoring the raw reply would count Fear Levels the parent never sees. The cleaning was moved into
`monitoring_capture.observations_in` (no change in what it does) so the runner calls the same code.
What the model offered and the app dropped is still visible, as the `fear_said_as_rating` check.

That check turned out to run the other way on the first run: all 6 Fear Levels it dropped were real
ratings ("at an 8 like full meltdown"). It is in the backlog.

## Comparing words without a model

"Were the parent's words kept" is measured by content words: drop small words and speech fillers,
spell numbers as digits, cut endings. Three things the first runs showed:

- Cut endings on both sides the same way, including a final "e" and a doubled consonant. Without
  that, "getting" (from the model's "getting ready") became "gett", which is not "get", and was
  counted as a word the parent never said.
- Split "6pm" into "6" and "pm". As one token it never matches the parent's "at like 6".
- "Fear" is not a feeling word for this count. The model writes "her Fear Level was a 6", which is
  the parent's number in the app's own term.

## A family gives several cases

`cases.BUILDERS` return a list. Monitoring analysis is one case per family, voice notes one per note.
`--limit` still counts families. The report now says how many families the cases came from.
