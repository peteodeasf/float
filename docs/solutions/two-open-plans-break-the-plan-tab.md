# Two unfinished plans break the Plan tab, and Create made more

**2026-10-29.** Issue #92: on an older test patient, Create treatment plan "cycles for a bit and
then nothing happens".

## What was going on

- Every lookup of "the patient's plan" uses `scalar_one_or_none()` on unfinished plans
  (`get_active_plan`, and the child's and parent's ladder lookups). A second unfinished plan makes
  each of them raise `MultipleResultsFound`, so the request returns a server error.
- The Plan tab treats "no data" and "the request failed" the same, so it showed
  "No treatment plan yet" and the Create button.
- `POST /patients/{id}/plan` never checked for an existing plan. Each click added another, and the
  tab stayed broken. Reproduced in a test: two creates, then the GET raises `MultipleResultsFound`.

How the first duplicate was made on that patient is not known. Nothing on the production database
was opened to find out.

## The fix

- A partial unique index, `uq_treatment_plans_one_open_per_patient`: one row per patient where
  `status != 'complete'`. Completed plans do not count.
- Create returns the existing unfinished plan (200) instead of adding one (201).
- Reopening a completed plan while another is open returns 409, not a server error.
- The migration clears up existing duplicates first: keep the plan with the most situations, delete
  extras nothing points at, mark the rest complete.

## Worth knowing

- **Do not call `db.rollback()` to recover from an IntegrityError inside a request.** The test
  `db` fixture runs each test inside an outer transaction, and a session rollback there throws away
  the test's own setup rows. Use `async with db.begin_nested():` around the insert, so only the
  savepoint is undone. It is also correct in production.
- **A migration that reads the database from Python does not render offline** (`alembic upgrade
  --sql`), and CLAUDE.md asks that it does. Put dynamic work in a `DO $$ ... $$` block. Here the
  block reads `pg_constraint` to find every column pointing at `treatment_plans`, so "nothing points
  at it" stays true if a table is added later.
