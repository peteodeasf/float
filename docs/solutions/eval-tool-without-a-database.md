# Running an AI eval through app code that needs the database

## Symptom
`backend/evals/preliminary_report/run_eval.py` sent the report prompt the raw log only. The app
had moved to writing the report from the saved list plus the log, so the eval was scoring a
different input from the one clinicians get.

## Root cause
The eval copied the route's input instead of calling it. The route's input depends on the saved
list, which `insight_service.rebuild_from_monitoring` builds in Postgres. That made "call the same
code" look like it needed a database, so the copy was the easy path.

## Fix
- The report call moved into `insight_service.request_report` (next to `request_extraction`), and
  the list's sort order into `insight_service.by_evidence`. The route and the eval both use them.
- `backend/evals/preliminary_report/app_pipeline.py` runs the real `rebuild_from_monitoring`
  against `_NoDatabase`: an empty stand-in with `execute` (returns nothing saved), `add` and
  `flush`. Every eval case is a first analysis, so "nothing saved yet" is the true state.
- `backend/tests/test_preliminary_report_eval.py` runs the real route on `float_test` and the eval
  on the same log, with the same fake model, and asserts both calls are identical.

Two details the stand-in has to copy from Postgres:
- `flush` must give new rows an id. Behaviors point at their situation's id, and SQLAlchemy only
  fills `default=uuid.uuid4` at insert time.
- `flush` must give every row the same `first_seen_at`. Postgres `now()` is the transaction's start
  time, so one analysis writes one time. Leaving it `None` crashes the sort on a tie.

## How to avoid it next time
Do not point an eval at a production-pointing database to reach app code (on Peter's laptop
`DATABASE_URL` is production). Stand in for the database at the session level, and add a test that
compares the eval's model calls with the real route's. That test is what keeps them from drifting.
