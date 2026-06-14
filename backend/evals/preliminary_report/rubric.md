# Preliminary Report — clinician scoring rubric

Score each generated report (`outputs/<case>.md`) against its input case (`cases/<case>.json`).
Each criterion is **0 or 1** (fail/pass). Record in `outputs/scoring_sheet.csv`.
There is no single "correct" output — judge whether a clinician would accept it as a **starting draft**.

| # | Criterion (column) | Pass (1) means… |
|---|---|---|
| 1 | `situations_clustered` | The raw observations are grouped into a sensible, non-redundant set of trigger situations at the right granularity (not one-per-entry, not over-merged). Names are clinically readable. |
| 2 | `dt_plausible` | Each situation's fear-thermometer score is defensible given the entries (≈ the highest observed for that theme), and the list is ordered low→high. |
| 3 | `behavior_classification` | Safety behaviors / avoidance / rituals are correctly identified and the section is labelled appropriately ("Rituals" for OCD-style; otherwise "Safety & avoidance behaviors"). |
| 4 | `parental_responses` | The parental responses / accommodations are captured accurately and completely, no major one missed. |
| 5 | `treatment_targets` | Targets are sensible and ordered easiest-first (lowest DT) for exposure laddering. |
| 6 | `no_fabrication` | **Critical.** Nothing material is asserted that the entries don't support. Reasonable clinical *synthesis* is allowed (we chose "fuller picture"), but invented situations/behaviors with no basis = **0**. Note exactly what was invented in `fabrication_notes`. |
| 7 | `overall_acceptable` | A clinician would use this as a starting-point report with only light edits. |

## How to use
1. Run `run_eval.py` to generate `outputs/<case>.md` + `outputs/<case>.json` and a blank `outputs/scoring_sheet.csv`.
2. For each row, read the report next to its case and fill 0/1 for criteria 1–7, plus `fabrication_notes` / `notes`.
3. Run `summarize_scores.py` to get per-criterion pass rates with 95% Wilson confidence intervals, split by `held_out`.

## What the numbers mean
- Only **`held_out: true`** cases measure generalization. The 3 seed cases (Patrick/Maya/Kemp) are *in the prompt*, so their scores are a regression/sanity check, not evidence of accuracy.
- `no_fabrication` is the highest-stakes metric given the "synthesize a fuller picture" design choice — watch it closely on sparse-data cases.

## Target coverage (build held-out cases across these)
Presentation: OCD/rituals · performance · health anxiety · social anxiety · separation anxiety · GAD · specific phobia.
Data condition: sparse (3–4 entries) · rich (10+) · missing DT scores · conflicting/contradictory entries · mostly-accommodation vs mostly-avoidance.

## Suggested sample sizes
- **~15–20 held-out cases**: smoke test; surfaces systematic failures. Directional only.
- **~50**: real pass-rate, ~±8% at 90% observed. Freeze as a regression set.
- **~100+**: defensible clinical claim (~±6%). Have 2 clinicians double-grade ~10–15 to check rubric reliability.
