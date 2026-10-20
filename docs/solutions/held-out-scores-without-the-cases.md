# Held-out scores without the cases

Found while building `AI-dev/evals/judging/run_held_out.py` (2026-10-19).

The agent that tunes prompts must see how it did on the held-out cases and nothing it could tune
against. Three things leak a case besides the obvious one (printing its text or the model's answer).

## Case ids leak too

The runner's report has a per-case table. It holds only ids and counts, so it looked safe. But a row
saying `fam-social-04: 1/4 situations found` tells the agent which file to open. The held-out report
drops `per_case` entirely, and the test checks no family id appears in the output.

## Error messages quote the input

A bad date in a log entry raises `ValueError: Invalid isoformat string: '<the text>'`. A traceback
prints that, and so would `str(e)`. The held-out script catches every error and prints its type only.
The runner already does this for failed API calls (`engine.py` keeps `type(e).__name__`), but not for
errors while building a case.

## Writing files is a leak waiting to happen

The runner writes `outputs.jsonl` with the model's raw answers, for reading by hand. The held-out
script writes nothing, so there is no file for anyone to open later.

## How the test catches a leak

The fake AI client replies with the family's own behavior and situation text. So if the model's
answer reached the output, it would show up as case text. The test then walks every string in the
family file and fails on any of three or more words that appears in the output. Shorter strings are
skipped because labels like `safety` and `s1` appear in the report legitimately.
