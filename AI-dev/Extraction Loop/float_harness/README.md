# Float — Monitoring Extraction Harness

Deterministic test harness for the monitoring-extraction loop. It checks the
extractor's output against the fixture set; the fixtures define the **target
output shape** the extractor must conform to.

## Files
- `checks.py` — the four pure pass/fail checks (no model, no judgment).
- `extractor_adapter.py` — the **one seam** to the real extractor. Stubbed.
- `test_extraction_checks.py` — pytest wiring + negative tests.
- `tests/fixtures.json` — 17 cases, clinician-confirmed labels + `source_note`.

## The four checks
1. **behavior_enum** — every behavior type is one of `avoidance | safety | escape | unclear`.
2. **rating_integrity** — no `fear_rating` appears that isn't a number in the source note.
3. **no_duplicate_situations** — the same occurrence isn't emitted twice (a recurring
   situation at a different fear/behavior is allowed; an exact repeat is not).
4. **clean_json** — raw extractor text parses as JSON with no markdown fences.

## Run
```
pip install pytest
pytest -v
```

## Status: STUBBED
`extractor_adapter.extract()` currently echoes each fixture's expected output, so
the live checks pass trivially. They become meaningful when you wire the real
extractor: replace `extract()` with a real call + an adapter that maps the messy
auto-generated output into the target shape, and return the raw text so
`clean_json` can inspect it. If the adapter is hard to write, that's signal for
how far the current extractor is from the target.

## The loop (loop_driver.py)
The driver tunes the extraction prompt against the fixtures automatically:

```
load fixtures + current prompt
repeat:
  run extractor over all 18, score each (deterministic + accuracy + judge)
  log the iteration
  passed? (100% deterministic AND accuracy >= BAR)  -> DONE
  plateaued or max iterations?                       -> STOP
  analyze failures -> reviser proposes a new prompt
  revision touches clinical logic? -> PAUSE for human approval
  accept prompt, continue
```

Fixtures never change; only the prompt changes. The best prompt seen is saved.

**Files**
- `config.py` — models, accuracy bar, stop conditions, the clinical-gate switch.
- `extractor.py` — runs the prompt (temp 0). One seam to the real model.
- `judge.py` — isolated subjective scorer. Sees the note + output + rubric, NEVER the
  extraction prompt (enforced by the function signature).
- `scorer.py` — runs the extractor once per case, applies all three score layers.
- `analyze.py` — groups raw failures into patterns.
- `reviser.py` — proposes prompt edits; fixes general rules, not specific cases; tags
  each change `wording` or `clinical`.
- `loop_driver.py` — orchestration, logging, stop conditions, human gate.

**Run**
```
FLOAT_DRY_RUN=1 python loop_driver.py     # plumbing check, no API calls (uses gold echo)
python loop_driver.py                      # real run (needs ANTHROPIC_API_KEY)
python loop_driver.py --non-interactive    # stop at the clinical gate instead of prompting
```

**The two decisions baked into config**
- `ACCURACY_BAR` (default 0.90) — your clinical-risk judgment for "good enough" type
  accuracy. Deterministic checks must always be 100%.
- `REQUIRE_APPROVAL_FOR_CLINICAL` (default True) — the loop runs and scores
  automatically, but any prompt edit that changes clinical meaning pauses for sign-off.

**Overfitting guard:** the loop tunes on all 18. It can only prove it handles those 18,
not that it generalizes. Validate with a separate, deliberately-varied test set
(real/realistic notes, Dr. Walker's labels) that the loop never sees. A fixture is
training or test, never both.

## Known gaps
- **LLM-judge layer not built.** The accuracy layer (`accuracy.py`) scores behavior
  *type* correctness with deterministic situation alignment. What it does NOT score
  is the subjective slice: whether a situation name is in the family's own language
  and whether a behavior description faithfully reflects the source note. Those need
  a fresh-context LLM judge against a rubric — the next layer.

## Accuracy layer (`accuracy.py`)
Answers "did the extractor assign the right behavior types?" Aligns the extractor's
situations to the fixture's on strong signals (fear rating + name + type-set
overlap), then compares behavior-type multisets within each matched situation.
Reports situation recall, type accuracy, mismatches, and missed/invented situations.
The one tunable knob is `MATCH_FLOOR` (documented in the file).

---

# The tuning loop

The harness above *scores*. The loop *uses* the scores to improve the extraction
prompt automatically, then repeats. The fixtures stay frozen; only the prompt changes.

## Files
- `config.py` — every tunable: models, the accuracy bar, stop conditions, the clinical-approval gate, `DRY_RUN`.
- `extractor.py` — the one seam to the real model (`extract()`), temperature 0.
- `judge.py` — the isolated subjective scorer. Its signature has **no** prompt parameter — it never sees the prompt being tuned, by construction.
- `scorer.py` — runs the extractor once per case, applies all three score layers, aggregates.
- `analyze.py` — groups failures into patterns ("3 cases confused escape and avoidance").
- `reviser.py` — proposes prompt edits; classifies each as `wording` or `clinical`.
- `loop_driver.py` — the driver: run → score → log → (pass / plateau / max) → analyze → revise → gate → repeat.

## The cycle
1. Run the current prompt over all fixtures.
2. Score each: deterministic gate + type accuracy + isolated judge.
3. If deterministic is 100% **and** accuracy ≥ `ACCURACY_BAR` → done. If plateaued or max iterations → stop.
4. Analyze failures into patterns; the reviser proposes a new prompt that fixes the **general rule**, not the specific case.
5. If the revision touches **clinical logic** (what counts as avoidance/safety/escape, accommodation/rating rules, scope) → pause for human approval. Wording-only changes apply automatically.
6. Repeat. The best deterministically-clean prompt seen is saved.

## Run it
```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...

FLOAT_DRY_RUN=1 python loop_driver.py     # plumbing check, no API calls (echoes gold)
python loop_driver.py                      # real run
python loop_driver.py --non-interactive    # halt at the clinical gate instead of prompting
```

Each run writes `runs/<timestamp>/iter_NN/` with the prompt, the report, and any proposed
changes, plus `best_prompt.md`. Set `STABILITY_RUNS > 1` in config early on to confirm
temperature-0 output is stable before trusting a score.

## Two settings that are clinical judgment, not defaults
- `ACCURACY_BAR` (default 0.90) — how good is good enough on behavior-type accuracy. Deterministic checks must always be 100% (a floor). The accuracy bar is a clinical-risk call.
- `REQUIRE_APPROVAL_FOR_CLINICAL` (default True) — keep this on. It's what stops the loop from silently rewriting Dr. Walker's clinical rules to make a number go up.

## Overfitting guard
Tuning on all 18 proves the prompt handles those 18, not that it generalizes. Validate
the tuned prompt against a **separate** test set built from differently-sourced notes
(real pilot notes, or test cases Dr. Walker keeps apart from training), labels confirmed
by her. A fixture is training or test, never both; the loop never sees the test set.
