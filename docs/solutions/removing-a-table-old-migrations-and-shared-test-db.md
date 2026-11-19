# Removing a feature: old migrations import app code, and the test database is shared

**2026-11-19.** Worked out while removing the process checklist.

## An old migration can import the code you are deleting

`b9f1c2d3e4a5_organization_checklist_items.py` imported `DEFAULT_PROCESS_CHECKLIST` from
`app/data/default_checklist.py` to seed each practice. Alembic loads every revision file on every
run, so deleting that module breaks `alembic upgrade` everywhere, including Railway's deploy. Before
deleting app code, search `backend/migrations/versions` for imports of it, and copy what the
migration needs into the migration itself. Its behavior stays the same.

## Two branches with migrations share one test database

The tests build `float_test` with `alembic upgrade head`. When another session's branch has run
its own new migration there, the database is at a revision this branch has never heard of, and
every test errors with `No such revision`. Do not downgrade the shared one: give the branch its own.

    PGPASSWORD=float psql -h localhost -p 55432 -U float -d postgres -c "CREATE DATABASE float_test_<branch>"
    TEST_DATABASE_URL="postgresql+asyncpg://float:float@localhost:55432/float_test_<branch>" \
      ~/code/float/backend/.venv/bin/python -m pytest tests/

Drop it afterwards. The same goes for screenshots of a migrated schema: `float_dev` is used by the
shared backend on port 8000, so copy it (`pg_dump float_dev | psql float_dev_<branch>`), migrate the
copy, and run the branch's backend against it (`DATABASE_URL=...` on port 8011, see
`screenshots-on-the-mini.md`).

Two open branches that each add a migration on the same parent make two heads once both merge.
Whichever merges second moves its `down_revision` to the other.
