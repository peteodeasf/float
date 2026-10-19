"""Run one case through Analyze with AI the way the app does, without a database.

The route (`generate_preliminary_report` in backend/app/api/routers/patients.py) makes two calls:
first the list (situations, behaviors, accommodations) is pulled out of the log and saved, then the
report is written from that list plus the log. This module calls the same app code for every step:

  * the log as text:          insight_service.format_entries
  * the list call:            insight_service.request_extraction with EXTRACTION_SYSTEM_PROMPT
  * folding the list in:      insight_service.rebuild_from_monitoring
  * the list's order:         insight_service.by_evidence (what get_insights uses)
  * the report call:          insight_service.request_report with PRELIMINARY_REPORT_SYSTEM_PROMPT
  * reading both replies:     insight_service.parse_model_json

The only thing not the app's is the database. Each case is a patient being analyzed for the first
time, so `_NoDatabase` stands in for an empty one: nothing already saved, rows kept in memory. That
is the one situation this matches the route in. A patient with items already saved, or items a
clinician removed, would give the route a different list. backend/tests/test_preliminary_report_eval.py
checks the result matches the real route for a first analysis.

Cases have no dates. The app always has one, so entries are dated a day apart from 2026-06-01,
unless an entry gives its own "date" (YYYY-MM-DD). Like the route, entries are then put in date
order before they are numbered.
"""
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIRST_DATE = date(2026, 6, 1)


def entries_from_case(case: dict) -> list[SimpleNamespace]:
    """The case's entries as the fields a saved monitoring entry has, oldest first."""
    out = []
    for n, e in enumerate(case.get("entries", [])):
        out.append(SimpleNamespace(
            id=uuid.uuid4(),
            entry_date=date.fromisoformat(e["date"]) if e.get("date") else FIRST_DATE + timedelta(days=n),
            situation=e.get("situation"),
            child_behavior_observed=e.get("child_behavior_observed"),
            parent_response=e.get("parent_response"),
            fear_thermometer=e.get("fear_thermometer"),
            parent_words=e.get("parent_words"),
        ))
    return sorted(out, key=lambda e: e.entry_date)  # the route orders by entry_date


class _NoDatabase:
    """An empty database for one first analysis.

    rebuild_from_monitoring asks what is already saved (nothing), adds rows, and flushes so new rows
    get an id their behaviors can point at. Postgres fills in `first_seen_at` with the time the
    transaction started, so every row from one analysis gets the same time; this does the same.
    """

    def __init__(self):
        self.rows = []
        self._now = datetime.now(timezone.utc)
        self._queried = False

    async def execute(self, _query):
        # rebuild_from_monitoring asks one question: what is saved already. If it starts asking
        # more, "nothing" may be the wrong answer, so stop rather than build a different list.
        if self._queried:
            raise RuntimeError(
                "rebuild_from_monitoring now runs more than one query; update _NoDatabase to match"
            )
        self._queried = True
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    def add(self, row):
        self.rows.append(row)

    async def flush(self):
        for row in self.rows:
            if row.id is None:
                row.id = uuid.uuid4()
            if row.first_seen_at is None:
                row.first_seen_at = self._now


async def _first_list(extraction: dict, by_number: dict) -> list:
    from app.services import insight_service

    db = _NoDatabase()
    await insight_service.rebuild_from_monitoring(
        db,
        patient_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        extraction=extraction,
        entry_ids_by_situation=insight_service.entry_ids_by_situation(extraction, by_number),
    )
    return insight_service.by_evidence(db.rows)


async def run_case(client, case: dict) -> tuple[dict, dict]:
    """Both calls for one case. Returns (the list as the model gave it, the report).

    Raises json.JSONDecodeError if either reply has no JSON in it, as the route would fail.
    """
    from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT, PRELIMINARY_REPORT_SYSTEM_PROMPT
    from app.services import insight_service

    entries_text, by_number = insight_service.format_entries(entries_from_case(case))
    extraction = insight_service.parse_model_json(
        insight_service.request_extraction(client, EXTRACTION_SYSTEM_PROMPT, entries_text)
    )
    insights = await _first_list(extraction, by_number)
    report = insight_service.parse_model_json(
        insight_service.request_report(client, PRELIMINARY_REPORT_SYSTEM_PROMPT, insights, entries_text)
    )
    return extraction, report
