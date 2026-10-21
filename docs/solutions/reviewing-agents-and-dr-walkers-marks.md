# Building the reviewing agents: what had to be worked out

2026-10-20. Rung and step-sentence reviewers, `AI-dev/evals/judging/reviewers.py`.

## Dr. Walker's marks are only in production

The plan says to measure the rung reviewer against her 60 marks from 2026-08-29. The 60 suggestions
are in the repo (`AI-dev/Ladder Eval/cases_drafted*.json`, 20 in each file, 16 situations). Her
marks are not. They were saved through the review link into `review_marks` in the production
database. The local `float_dev` has no review rounds at all.

Agents never copy production data, and the AI test items say "nothing from production, ever". So
the check script takes the marks as a file (`--marks`), with no copy in the repo, and the judging
README has the query for Peter to export them. Without the file it runs and reports verdicts only.

## Her marks are saved by position

The review page saves each mark under `<situation id>:<position>` (`review_page.allowed_choices`).
The round was built from a source file that is no longer in the repo
(`review_sheet_source.json`), so nothing proves its order matches the case files. The export query
pulls the suggestion text from the round too, and a mark whose text differs is dropped and listed.

## Her rules quote the test cases

Her written rules in `docs/plans/ladder-generation.md` are comments on particular situations: the
bee bench, the sleepover, the oral report, getting ready for school, raising a hand. All of these
are among the 60 the reviewer is checked on. Quoting her in full would give the reviewer her verdict
on those cases, which is the "case in the prompt" mistake
(`eval-cases-burned-by-putting-them-in-the-prompt.md`) on the marking side. The instructions give
the general rule only, and Peter's restatements where he made them.

A second, unavoidable version of the same problem: her rules were written *from* her comments on
these 60. Agreement on them will look better than it would on suggestions she has not seen. Every
report says so.

## The CI check does not see reviewer instructions

`check_no_cases_in_prompts.py` scans the strings in `backend/app/` only. Reviewer instructions are
Markdown in `AI-dev/evals/judging/reviewers/`, so it does not look at them. Keeping cases out of them
is by hand for now.

## Calling the new models

- Opus 5.5 and Sonnet 5.5 always think, so `content[0]` can be a thinking block. Read the text blocks
  by type.
- They take no temperature. Sending one is an error.
- The backend's pinned SDK (0.69) has no `output_config` argument; effort goes in `extra_body`, as
  `combination_wording.py` already does.
- No server-side fallback on a refusal: the fallback model could be the feature's own model, and
  the reviewer must run on a different one. A refusal is recorded as an error.
- The runner's spending limit refuses a model with no price, so both were added to
  `budget.PRICES_PER_MTOK`.
- A run of 144 reviewer calls (60 suggestions, 3 reviewers, 3 runs) takes longer than ten minutes
  one call at a time. Run it in the background.

## "Objection needs a rule" is decided in code

The reviewer is asked to name a rule id for every objection, but whether it did is checked in
`judge()`, against that reviewer's own rule list parsed from its `## <id>` headings. A made-up id,
another reviewer's id, an empty one or "none" is an opinion. A "don't show" with only opinions
counts as show. Leaving it to the reviewer would let it mark by taste and call it Dr. Walker's rule.
