# Preliminary Report — eval harness

Measures the accuracy of the Step-2 "Analyze with AI" preliminary-report generation.

It runs the **real, deployed** `PRELIMINARY_REPORT_SYSTEM_PROMPT` (imported from
`app.api.routers.patients`, so it never drifts) over file-based case fixtures, captures the
structured output, and gives you a clinician scoring sheet. It does **not** touch the
database or the API — cases are JSON, the model is called directly.

## Layout
```
cases/            input fixtures (one JSON per case); _TEMPLATE.json to add more
rubric.md         clinician scoring rubric (7 criteria) + sample-size guidance
run_eval.py       runs the prompt over cases -> outputs/<case>.{json,md} + blank scoring_sheet.csv
summarize_scores.py   filled sheet -> per-criterion pass rates + 95% Wilson CIs (split by held_out)
outputs/          generated (gitignored)
```

## Run
```bash
# from the backend environment (the one that runs the API)
export ANTHROPIC_API_KEY=sk-...
cd backend/evals/preliminary_report
python run_eval.py            # or: python run_eval.py --case kemp
```
Then grade `outputs/scoring_sheet.csv` per `rubric.md` and:
```bash
python summarize_scores.py
```

## The one thing to remember
The 3 seed cases (Patrick/Maya/Kemp) are **in the prompt** as few-shot exemplars, so they
only sanity-check regressions — they are **not** evidence of accuracy. Real confidence comes
from **`held_out: true`** cases the model has never seen. Start with ~15–20 stratified across
the presentation types and data conditions listed in `rubric.md`; freeze ~50 as a regression
set once the prompt is stable.

> De-identify any real patient data before adding it to `cases/`.
