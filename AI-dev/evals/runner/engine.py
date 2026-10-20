"""Runs each case N times: the feature's call, then the code checks, then any reviewing agents.

A feature is a module with: NAME, model(), app_prompt(), prepare(case), call(client, prepared),
read(raw), checks(case, prepared, parsed), score(case, prepared, parsed) and NOT_COVERED.
`monitoring_analysis.py` is the first.

Reviewing agents are a later item. The hook is `reviewers`: callables taking
(case, prepared, parsed) and returning a dict. They run only after the code checks, and only on a
reply the app could read.
"""
from collections import Counter
from dataclasses import dataclass, field

from budget import BudgetExceeded

UNREADABLE = "unreadable"


@dataclass
class Run:
    raw: str | None
    parsed: dict | None
    checks: dict[str, list[str]]
    score: dict | None
    reviews: list[dict] = field(default_factory=list)
    error: str | None = None

    @property
    def signature(self) -> str:
        return self.score["signature"] if self.score else UNREADABLE


@dataclass
class CaseResult:
    case_id: str
    runs: list[Run]

    @property
    def stability(self) -> float | None:
        # A failed call is not an answer. Two timeouts must not count as two runs agreeing.
        return stability([r.signature for r in self.runs if not r.error])


def stability(signatures: list[str]) -> float | None:
    """How often the runs agree: the share of runs that match the most common answer.

    1.0 means every run gave the same answer. With 3 runs, 0.67 means one disagreed, and 0.33 means
    no two agreed. None when there were no runs.
    """
    if not signatures:
        return None
    return Counter(signatures).most_common(1)[0][1] / len(signatures)


def run_cases(feature, cases, client, runs: int, reviewers=()):
    """Returns (results, stopped). `stopped` says why the run ended early, or is None.

    A spending stop ends everything at once, part-way through a case if need be; the runs done so
    far are kept and reported. Any other failed call is recorded on that run and the next goes on.
    """
    if runs < 1:
        raise ValueError("runs must be at least 1")
    results: list[CaseResult] = []
    stopped = None
    for case in cases:
        prepared = feature.prepare(case)
        result = CaseResult(case.id, [])
        results.append(result)
        for _ in range(runs):
            try:
                raw = feature.call(client, prepared)
            except BudgetExceeded as e:
                stopped = str(e)
                break
            except Exception as e:  # an API error on one call should not lose the night
                result.runs.append(Run(None, None, {}, None, error=type(e).__name__))
                continue
            parsed = feature.read(raw)
            checks = feature.checks(case, prepared, parsed)
            score = feature.score(case, prepared, parsed) if parsed is not None else None
            reviews = [r(case, prepared, parsed) for r in reviewers] if parsed is not None else []
            result.runs.append(Run(raw, parsed, checks, score, reviews))
        if stopped:
            break
    if results and not results[-1].runs:
        results.pop()
    return results, stopped
