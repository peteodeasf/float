# Judging

How Float's AI features are marked. Plan: `docs/plans/ai-quality-testing.md`, "Trevor runs it".

**If you are an agent tuning a prompt, this folder is not yours.**
- Do not edit anything in it.
- Do not open, print or search the held-out cases (`held_out/`).
- Get held-out results only from `run_held_out.py`, which prints scores and counts.

The agents that write the prompts must not be able to change how their work is marked, or see the
cases they are marked on. A prompt tuned while looking at its test cases scores well on those cases
and nowhere else. That has happened three times
(`docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md`).

## What goes here

- **`held_out/`**: the held-out cases, one family per file, in the waiting pool's format
  (`AI-dev/evals/pool/README.md`). A pool family goes here only after Peter has accepted it into the
  fixed test set and it has been split to held-out. Empty for now: no pool family has been accepted
  yet.
- **The reviewing agents' instructions**, when they are built (plan, item 10). Their rules come from
  Dr. Walker's, quoted from `docs/plans/ladder-generation.md`.

Working cases, the ones prompts are tuned on, do not go here. The runner reads them from the pool
(`AI-dev/evals/runner/`).

## Scores for the held-out cases

From the repo root, with the backend's Python:

    ~/code/float/backend/.venv/bin/python AI-dev/evals/judging/run_held_out.py --runs 3 --budget 10

It runs the same code as the runner (`AI-dev/evals/runner/`), on the held-out cases, and prints:
- the totals, each with the number of runs it is counted over,
- how many runs failed each code check,
- the stability figure, averaged over the cases,
- what was spent, and what the cases don't cover.

It does not print:
- any text from a case,
- any of the model's answers,
- which case scored what, or even the case ids. A per-case score says which case to go and read.

It writes no files. Errors are printed as their type only, since an error message can quote a case.

Needs `ANTHROPIC_API_KEY`. Touches no database. `--budget` is the spending limit in dollars, as in the
runner.

Tests, with a fake AI client and no spending:

    ~/code/float/backend/.venv/bin/python -m pytest -q AI-dev/evals/judging/tests
