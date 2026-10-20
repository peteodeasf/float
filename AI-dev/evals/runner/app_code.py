"""Makes the app's own code importable, so the runner tests the app and not a copy of it.

The old 0.926 score on monitoring analysis came from a copy of the prompt that had drifted from the
app's (`AI-dev/Extraction Loop/float_harness/README.md`). Every prompt and call the runner uses is
imported from `backend/app/` through here.
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"
HARNESS = ROOT / "AI-dev" / "Extraction Loop" / "float_harness"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def harness_module(name: str):
    """A module from float_harness, loaded under its own name so it cannot clash with another
    `checks.py` (the Ladder Eval has one too)."""
    key = f"float_harness_{name}"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, HARNESS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return module
