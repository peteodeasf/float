"""
The single seam between the harness and the real extractor.

Right now this is STUBBED. The existing in-app extractor was auto-generated and
its output shape is not something to build around, so we do NOT call it here yet.
Instead the stub echoes the fixture's own expected output, which lets the harness
run end-to-end and proves the checks execute. Every test that depends on real
extraction is therefore trivially green until the real extractor is wired in.

To wire the real extractor:
  1. Replace `extract()` below with a call to the real extractor.
  2. Map (adapt) whatever it returns into the target shape defined by the
     fixtures: {"situations": [{"name", "fear_rating", "fear_rating_max"?,
     "behaviors": [{"type", "description", ...}], "accommodations": [...]}]}.
  3. `extract()` must return the RAW TEXT the extractor produced (so check_clean_json
     can verify no fences / valid JSON), plus the parsed dict.

Until then, STUB_MODE=True.
"""

import json

STUB_MODE = True


def extract(source_note, expected=None):
    """
    Returns (raw_text, parsed_dict).

    STUB: returns the expected fixture output as clean JSON text. Replace with a
    real extractor call + adapter. `expected` is only used by the stub.
    """
    if STUB_MODE:
        payload = {"situations": expected["situations"]} if expected else {"situations": []}
        raw = json.dumps(payload, ensure_ascii=False)
        return raw, json.loads(raw)

    # --- real extractor goes here ---
    # raw = real_extractor(source_note)          # returns text
    # parsed = adapt_to_target_shape(raw)        # map messy output -> target shape
    # return raw, parsed
    raise NotImplementedError("Wire the real extractor + adapter here.")
