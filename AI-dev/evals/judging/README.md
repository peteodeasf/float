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
- **The reviewing agents' instructions**, in `reviewers/` (plan, item 10). See "The reviewing
  agents" below.

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

## The reviewing agents

For the two features with no single right answer: suggested rungs and step sentences. Code in
`reviewers.py`, instructions in `reviewers/`.

One reviewer per concern, each told to check that one thing only:

| File | Checks | Its rules |
|---|---|---|
| `reviewers/her_rules.md` | Dr. Walker's written rules | `no-way-out`, `vary-the-situation`, `symptom-not-target` |
| `reviewers/child_safety.md` | The child's safety | `no-way-out`, `no-new-fear`, `nothing-invented` |
| `reviewers/age.md` | Reads right for the child's age | `plain-words`, `fits-the-age`, `american-spelling` |

`reviewers/frame.md` is what every reviewer is told about how to answer. Each rule says where it
comes from. Dr. Walker has written nothing about wording for age, so the age reviewer's rules are
Float's own, and it is told to expect more of its objections to be opinion.

**Her rules are given in general words.** Where she wrote about a particular child's situation (the
bee bench, the sleepover, the oral report, getting ready for school), only the general rule is
quoted. Those situations are among the 60 the reviewer is checked on. Giving it her verdict on them
would be putting the test case in the prompt.

**Each objection must name its rule.** The reviewer says show or don't show for each item, and
names a rule id for every objection. The code, not the reviewer, decides what counts:
- an objection naming one of that reviewer's rules is a broken rule;
- one naming "none", nothing, or a rule that reviewer does not have is the reviewer's opinion;
- "don't show" counts only with a broken rule. "Don't show" with opinions alone counts as show, and
  is reported apart. "Show" with a broken rule named counts as don't show, and is reported apart.

**A different model from the feature.** Rung reviewers run on `claude-opus-5-5` (the feature runs on
`claude-sonnet-4-6`). Step-sentence reviewers run on `claude-sonnet-5-5` (the feature runs on
`claude-opus-5-5`). The feature's model is read from the app, and `check_models()` fails if they
match. No temperature (these models take none), and no fallback model on a refusal, since the
fallback could be the feature's own model.

**Step-sentence verdicts are unchecked.** Dr. Walker has marked no step sentences. Every
step-sentence review carries `checked=False`.

To hook a reviewer into the runner: `run_cases(..., reviewers=[reviewers.engine_hook(r, client,
to_item)])`, where `to_item` builds the item (`rung_item` or `step_item`) from the case and reply.

## Checking the rung reviewer against Dr. Walker's marks

    ~/code/float/backend/.venv/bin/python AI-dev/evals/judging/check_rung_reviewer.py \
        --runs 3 --budget 10 --marks ~/walker-marks.csv

Runs the three rung reviewers on the 60 suggestions she reviewed on 2026-08-29
(`AI-dev/Ladder Eval/cases_drafted*.json`, 16 situations) and counts how often they agree with her
marks, alone and all three together. Sixty can show the reviewer is badly off. It cannot show it is
right.

**Her marks are not in the repo.** They are in the review tables of the production database, and
agents never copy production data. Without `--marks` the script still runs and reports the
reviewers' verdicts, with no agreement figures. To export them (Peter, from a machine with the
production database; the round's slug is the one used with `seed_review_round.py`):

    \copy (select m.item_key, m.choice, i->'suggestions'->>split_part(m.item_key, ':', 2)::int as suggestion
           from review_marks m
           join review_reviewers r on r.id = m.reviewer_id
           join review_rounds o on o.id = r.round_id
           cross join jsonb_array_elements(o.items) i
           where o.slug = '<round slug>' and r.name = 'Dr. Walker'
             and i->>'key' = split_part(m.item_key, ':', 1))
      to 'walker-marks.csv' csv header

The suggestion text is there so a mark is never compared with the wrong suggestion: a mark whose
text does not match the files is dropped, and listed.

Writes `runs/<timestamp>/` beside the script (not committed): `report.md` and `report.json` with
counts only, and `outputs.jsonl` with every verdict and its reasons.

Tests, with a fake AI client and no spending, are in `tests/test_reviewers.py`.
