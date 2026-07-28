"""
Turn raw failures into a grouped, human-and-model-readable summary. The point is to
surface PATTERNS ("3 cases confused escape and avoidance") rather than isolated misses,
so the reviser fixes general rules instead of patching individual cases.
"""
from collections import defaultdict


def analyze(report):
    failures = report["failures"]
    by_check = defaultdict(list)
    for f in failures:
        by_check[(f["layer"], f["check"])].append(f)

    lines = []
    lines.append(f"Deterministic pass: {report['deterministic_pass']}")
    lines.append(f"Type accuracy: {report['type_accuracy']}")
    lines.append(f"Judge pass rate: {report['judge_pass_rate']}")
    lines.append(f"Total failures: {len(failures)}")
    lines.append("")

    # type mismatches get special treatment — show the confusion direction
    for (layer, check), items in sorted(by_check.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"[{layer}/{check}] x{len(items)}")
        for it in items[:6]:
            d = it["detail"]
            if check == "type_mismatch" and isinstance(d, dict):
                lines.append(f"  - case {it['case_id']} '{d.get('situation')}': "
                             f"gold {d.get('gold_types')} vs output {d.get('output_types')}")
            else:
                lines.append(f"  - case {it['case_id']}: {d}")
        if len(items) > 6:
            lines.append(f"  ... and {len(items) - 6} more")
        lines.append("")

    return "\n".join(lines)
