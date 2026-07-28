"""
Accuracy layer for the Float monitoring-extraction loop.

Separate from the four structural checks in checks.py. This one answers "did the
extractor assign the right behavior TYPES?" -- which requires matching the
extractor's situations to the fixture's situations first (the alignment problem).

Design choices (kept deliberately deterministic):
  * Situations are aligned on STRONG signals: fear rating equality + situation-name
    similarity + behavior-type-set overlap, combined into one score. Greedy
    one-to-one assignment above a floor. This disambiguates even same-name /
    same-rating situations (e.g. the two "Bedtime, 7/10" entries) because their
    behavior-type sets differ.
  * Within a matched situation we compare the MULTISET of behavior types
    (e.g. {avoidance, safety}), not individual behavior strings. No text-similarity
    threshold on behaviors -> nothing fuzzy in the type scoring itself.
  * Whether a behavior's wording faithfully reflects the source is NOT scored here;
    that's the LLM-judge layer.

The one tunable knob is MATCH_FLOOR (how good a situation pairing must be to count
as the same situation). It's named and documented, not hidden.
"""

from collections import Counter
import difflib
import re

# weights for the situation-pairing score; documented knobs, not magic numbers
W_NAME = 0.5     # situation-name string similarity
W_RATING = 0.3   # fear-rating equality
W_TYPESET = 0.2  # overlap of behavior-type sets
MATCH_FLOOR = 0.35  # minimum score to treat two situations as the same one


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _name_sim(a, b):
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _typeset_jaccard(g, o):
    gs = set(b.get("type") for b in g.get("behaviors", []))
    os_ = set(b.get("type") for b in o.get("behaviors", []))
    if not gs and not os_:
        return 1.0
    return len(gs & os_) / len(gs | os_) if (gs | os_) else 0.0


def _pair_score(g, o):
    rating_eq = 1.0 if g.get("fear_rating") == o.get("fear_rating") else 0.0
    return (W_NAME * _name_sim(g.get("name"), o.get("name"))
            + W_RATING * rating_eq
            + W_TYPESET * _typeset_jaccard(g, o))


def align_situations(gold_sits, out_sits):
    """
    Greedy one-to-one matching. Returns (matches, unmatched_gold_idx, unmatched_out_idx)
    where matches is a list of (gold_idx, out_idx, score).
    """
    candidates = []
    for gi, g in enumerate(gold_sits):
        for oi, o in enumerate(out_sits):
            candidates.append((_pair_score(g, o), gi, oi))
    candidates.sort(reverse=True)

    matches, used_g, used_o = [], set(), set()
    for score, gi, oi in candidates:
        if score < MATCH_FLOOR or gi in used_g or oi in used_o:
            continue
        matches.append((gi, oi, round(score, 3)))
        used_g.add(gi)
        used_o.add(oi)

    unmatched_gold = [i for i in range(len(gold_sits)) if i not in used_g]
    unmatched_out = [i for i in range(len(out_sits)) if i not in used_o]
    return matches, unmatched_gold, unmatched_out


def score_case(output, gold):
    """
    Returns a per-case accuracy report:
      situation_recall   -- fraction of gold situations that got matched
      type_accuracy      -- fraction of gold behaviors whose type the extractor got
                            right (counted by multiset intersection within matched
                            situations)
      mismatches         -- matched situations where the type multiset differs
      missed_situations  -- gold situations with no match (extractor dropped them)
      spurious_situations-- output situations with no match (extractor invented them)
    """
    gold_sits = gold["situations"]
    out_sits = output["situations"]
    matches, un_g, un_o = align_situations(gold_sits, out_sits)

    total_gold_behaviors = sum(len(s["behaviors"]) for s in gold_sits)
    correct_types = 0
    mismatches = []

    for gi, oi, score in matches:
        g_types = Counter(b["type"] for b in gold_sits[gi]["behaviors"])
        o_types = Counter(b.get("type") for b in out_sits[oi]["behaviors"])
        # behaviors whose type the extractor got right = multiset intersection
        correct_types += sum((g_types & o_types).values())
        if g_types != o_types:
            mismatches.append({
                "situation": gold_sits[gi]["name"],
                "gold_types": dict(g_types),
                "output_types": dict(o_types),
            })

    return {
        "situation_recall": (len(matches) / len(gold_sits)) if gold_sits else 1.0,
        "type_accuracy": (correct_types / total_gold_behaviors) if total_gold_behaviors else 1.0,
        "mismatches": mismatches,
        "missed_situations": [gold_sits[i]["name"] for i in un_g],
        "spurious_situations": [out_sits[i].get("name") for i in un_o],
    }
