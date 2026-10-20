# The AI test runner

Runs one of Float's AI features over cases from the waiting pool (`AI-dev/evals/pool/`), several
times each, and writes a report. Plan: `docs/plans/ai-quality-testing.md`.

Wired up so far: **monitoring analysis** (what Analyze with AI builds, and
`insight_service.rebuild_from_monitoring` saves). The other features are later items.

## It tests the app, not a copy

The prompt, the model, the call, the input text and the reading of the reply are all imported from
`backend/app/`. `monitoring_analysis.py` lists which function each comes from. Nothing here keeps its
own copy of a prompt. The old 0.926 score came from a copy that had drifted.

The runner never changes a prompt.

It runs the working cases from the pool. Held-out cases live in `AI-dev/evals/judging/` and are run
by `judging/run_held_out.py`, which prints scores only. See that folder's README.

## Run

From the repo root, with the backend's Python:

    ~/code/float/backend/.venv/bin/python AI-dev/evals/runner/run.py --limit 5 --runs 3 --budget 10

- It runs the **working half** of the pool: the odd-numbered families (`fam-social-01`,
  `fam-social-03`, ...), float_harness's rule. Prompts may be tuned on these. The even-numbered ones
  are held out. `--half all` runs every family.
- `--families fam-social-01,fam-health-03` picks families by id. A held-out one is refused unless
  `--half all` is given. `--limit N` takes the first N.
- `--runs` is how many times each case is run (default 3).
- `--budget` is the spending limit in dollars (default 10). The run stops when the next call could
  pass it, and the report says so and keeps what was done.
- Needs `ANTHROPIC_API_KEY` in the environment. Without it nothing runs.
- Touches no database.

It writes `runs/<timestamp>/` (not committed):
- `report.md` and `report.json`: scores and counts only. No case text and none of the model's
  answers, so it can go in a pull request.
- `outputs.jsonl`: the model's answers, one line per run, for reading by hand.

Tests, with a fake AI client and no spending:

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/runner/tests

## What it does with each case

1. Turns the pool family into a case (`cases.py`). Float is given the monitoring log only. Which
   situation each entry is about (`situation_ref`) stays in the answer key.
2. Calls the feature N times, through `MeteredClient`, which counts the spending (`budget.py`).
3. Runs the code checks on each reply: could the app read it, are the behavior types allowed ones,
   is any Fear Level invented, is any situation repeated. The last three are `float_harness`'s.
4. Then the reviewing agents. None exist yet. `run_cases(..., reviewers=[...])` is where they go.
   They only see replies the app could read.
5. Scores each run in counts (`monitoring_analysis.score`), so totals keep their sample size:
   situations found, behavior types right, parent actions written as child behaviors, and
   triggers not in the answer key. The report shows each score added up over every run, then for
   each run number on its own, and how many cases gave a different count from one run to the next.
6. Works out the stability figure: for each case, the share of its runs that gave the most common
   answer. Two runs agree when they find the same situations with the same behavior types under
   each. Wording is ignored.

## How a reply is matched to the answer key

By the log entries. The prompt asks the model to say which numbered entries each situation came
from. Each entry's `situation_ref` says which fact situation it is about. A model situation is
matched to the fact situation most of its entries are about. There is no fuzzy matching on names.

A model situation that points at no entry is counted as "unlinked". Two model situations matched to
the same fact situation count once, plus one "split". Together they are the triggers not in the
answer key. Matching by entry cannot tell a made-up trigger drawn from an entry from a real trigger
cut in two, so they are counted together.

## How a parent action is spotted

A behavior is counted as a parent action when its description starts with an adult ("Mom walks him
in", "Teacher lets him...") or with something allowed ("Allowed to stay home", "Was kept home").
Only the start of the sentence counts, so "Asks mom..." and "Left after the dog was let out" are the
child's. It is a wording rule, not a reading: a parent's action worded as the child's ("Stays home")
is missed. On 2026-10-19 it marked 0 of the 42 behaviors and all 34 accommodations Dr. Walker
confirmed in June, and 0 of 185 behaviors and all 123 accommodations in the pool's facts. A test
keeps the pool count at zero.

## Not scored

The risk flag is not scored and the risk label is not in the answer key. Peter, 2026-10-19: what
counts as a risk sign is a question for Dr. Walker. The full list of what is not covered is printed
at the end of every report (`NOT_COVERED` in `monitoring_analysis.py`).

## Do the two monitoring prompts add triggers? (`compare_triggers.py`)

The preliminary report prompt says of triggers the parent didn't log, "you may add them". The
extraction prompt forbids it. This script counts what each one adds, and changes neither prompt.

    ~/code/float/backend/.venv/bin/python AI-dev/evals/runner/compare_triggers.py --runs 3 --budget 9

For each working family and run it makes both app calls the way Analyze with AI does, then asks a
matcher on a different model (`claude-opus-5-5`) which log entries each situation describes, and
which triggers in its name no entry describes. The matcher is not told which prompt wrote the list.
A situation with no entry behind it is an added trigger. A logged situation widened with unlogged
triggers ("Dogs (and cats)") counts each extra as an added part.

It needs the matcher because the report's situations have no entry numbers. The matcher's reading
is a model's and no person has checked it: read `outputs.jsonl` before trusting a count.

Writes `runs/<timestamp>-triggers/`. The same split as the runner: `report.md` and `report.json` hold
counts only, `outputs.jsonl` holds the answers.

## Adding a feature

A feature is a module with `NAME`, `model()`, `app_prompt()`, `prepare(case)`,
`call(client, prepared)`, `read(raw)`, `checks(...)`, `score(...)` and `NOT_COVERED`
(see `engine.py`). Add its case builder to `cases.BUILDERS`, add it to `FEATURES` in `run.py`, and
add its model's price to `budget.PRICES_PER_MTOK`. A model without a price is refused.
