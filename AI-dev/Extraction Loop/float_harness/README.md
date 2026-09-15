# Float — Monitoring Extraction Test Tool

Scores the prompt behind **Analyze with AI** against 18 cases with clinician-confirmed answers, and
can try improving it.

## It tests the app, not a copy

Since 2026-09-15 the tool takes three things from the app instead of keeping its own:

- **The prompt:** `EXTRACTION_SYSTEM_PROMPT` in `backend/app/api/routers/patients.py`.
- **The call:** `insight_service.request_extraction` — the same model and settings the app uses.
  The app sets no temperature, so a case can come back differently between runs.
- **The input and the reading of the reply:** `insight_service.format_entries` and
  `parse_model_json`. Each case's note is split into monitoring entries, one per
  "(Situation, fear N/10)", and numbered the way the app numbers them.

Before that it used its own copy of the prompt (`Float-Extractor-Prompt.md`, deleted), asked the
model in a stricter way than the app, and its pytest checks used a stub that returned the right
answers. The 0.926 on record came from the copy.

**The tool never changes the app's prompt.** A better prompt it finds is saved in the run folder.
Adopting it is an edit to `patients.py`, reviewed by hand.

## Files

- `tests/fixtures.json` — 18 cases: a parent's note, the confirmed answer, and `split`.
- `extractor.py` — turns a case into the app's input and runs the app's call.
- `checks.py` — pass/fail checks, no model.
- `accuracy.py` — did the extractor give each behavior the right type.
- `judge.py` — isolated scorer for plain wording and faithfulness. Never sees the prompt.
- `scorer.py` — runs every layer on one output per case.
- `analyze.py`, `reviser.py` — group failures and propose prompt edits, each tagged `wording` or
  `clinical`.
- `loop_driver.py` — runs it all.
- `config.py` — the passing bar, stop conditions, the clinical gate, dry run.

## The checks on each output

1. **behavior_enum** — every behavior type is `avoidance | safety | escape | unclear`.
2. **rating_integrity** — no fear rating that isn't a number in the parent's note.
3. **no_duplicate_situations** — the same occurrence isn't returned twice.
4. **app_can_read** — the app's own reader could read the reply.

Then type accuracy (`accuracy.py`) and the judge.

## Tuning half and held-out half

Each case is `"tune"` (odd case ids) or `"holdout"` (even ids). The loop only sees the tuning
half. At the end, the best prompt is scored once on the held-out half and written to
`holdout_report.json`. That is the number to trust. Nine cases is small: it catches big problems,
not small ones.

## Run

From `backend/`, so the app's code imports. `railway run` supplies the Anthropic key without
showing it; nothing here touches the database.

```bash
FLOAT_DRY_RUN=1 .venv/bin/python "../AI-dev/Extraction Loop/float_harness/loop_driver.py"
railway run --service floatcbt -- .venv/bin/python "../AI-dev/Extraction Loop/float_harness/loop_driver.py" --non-interactive
```

The first is a plumbing check with no API calls. The second is a real run. With
`MAX_ITERATIONS = 1` it only scores the app's prompt; raise it to let the loop try revisions.

Tests (no API calls), from this folder:

```bash
../../../backend/.venv/bin/python -m pytest -q
```

Each run writes `runs/<timestamp>/`: each iteration's prompt and report, `holdout_report.json`,
and `best_prompt.md`.

## Two settings that are clinical judgment

- `ACCURACY_BAR` (0.90) — how good is good enough on behavior types. The checks must always pass.
- `REQUIRE_APPROVAL_FOR_CLINICAL` (True) — keep it on. It stops the loop rewriting clinical rules
  to make a number go up.

## Accuracy layer (`accuracy.py`)

Pairs the extractor's situations with the answer's on fear rating, name and behavior types, then
compares the behavior types inside each pair. Reports situation recall, type accuracy, mismatches,
and missed or invented situations. The one knob is `MATCH_FLOOR`.
