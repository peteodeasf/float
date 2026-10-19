# The AI test runner: matching answers to facts, and importing the app

Found while building `AI-dev/evals/runner/` (2026-10-19).

## Match situations by log entry, not by name

`float_harness/accuracy.py` pairs the model's situations with the answer key by name similarity,
Fear Level and behavior types, with a tuned floor. It has to: its 18 cases are free-text notes with
no link from a sentence to a situation.

The pool is different. Every log entry carries `situation_ref`, and the app's prompt already asks
the model which numbered entries each situation came from. So the runner matches a model situation
to the fact situation most of its entries are about. No fuzzy matching and no knob to tune. A model
situation that names no entry is counted as "unlinked", which is also the honest count of situations
with nothing in the log behind them.

## Don't name a file `app.py` next to code that imports the backend

The runner puts `backend/` on `sys.path` and imports `app.services...`. A helper called `app.py` in
the runner's own folder comes first on the path and hides the backend package, so
`from app.services import ...` fails with a confusing "not a package" error. It is `app_code.py`.

## Load float_harness modules by file path

`float_harness/checks.py` and `AI-dev/Ladder Eval/checks.py` are both `checks`. Putting a folder on
`sys.path` and writing `import checks` gets whichever was imported first. `app_code.harness_module`
loads float_harness files under the name `float_harness_<name>`, so they cannot collide.

## The Fear Level check is weaker than it looks

`check_rating_integrity` passes any rating that appears as a number anywhere in the text the model
was given. `format_entries` writes dates ("2026-09-28") and "Distress level: N/10" on every entry,
so 10 and every day of the month always "appear". It catches a rating like 77, not a rating of 9 on
a log dated the 9th. The report says so in its list of what is not covered.

## The first call has no cost to go on

The spending limit judges the next call by the dearest call so far. Before the first call there is
none, so it uses the call's `max_tokens` priced as output. That is pessimistic, which is the right
way round for a limit.
