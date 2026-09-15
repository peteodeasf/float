"""
Loop configuration. Everything tunable lives here.

The extraction prompt, model and call are not here: they come from the app (see extractor.py).
"""
import os

# --- Models for the tool's own steps ---
JUDGE_MODEL     = "claude-sonnet-4-6"   # isolated subjective scorer
REVISER_MODEL   = "claude-opus-4-8"     # meta: proposes prompt edits

# --- Passing bar (your clinical-risk judgment, not a technical default) ---
ACCURACY_BAR = 0.90          # min behaviour-type accuracy to "pass"
# deterministic checks must ALWAYS be 100% — that's a floor, not a knob.

# --- Stop conditions ---
MAX_ITERATIONS  = 1          # BASELINE: score the app's prompt as-is. Raise to auto-tune.
PLATEAU_WINDOW  = 3          # stop if no improvement over this many iterations
PLATEAU_EPS     = 0.005      # accuracy gain smaller than this counts as "no improvement"

# --- Human gate ---
REQUIRE_APPROVAL_FOR_CLINICAL = True   # pause for human sign-off on clinical-logic edits

# --- Repeat runs ---
# The app does not set a temperature, so the same note can come back differently. Set >1 to run
# each case again and flag the ones whose score-relevant output changes.
STABILITY_RUNS = 1

# --- Paths ---
HERE        = os.path.dirname(os.path.abspath(__file__))
FIXTURES    = os.path.join(HERE, "tests", "fixtures.json")
RUNS_DIR    = os.path.join(HERE, "runs")                        # per-iteration logs

# --- Dry run: use the gold-echo stub instead of calling the API ---
# Lets you validate the whole loop's plumbing without spending tokens.
DRY_RUN = os.environ.get("FLOAT_DRY_RUN", "0") == "1"
