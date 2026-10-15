# A branch's migration strands the shared local databases

**2026-10-15, on the Mac mini.**

## What happened

The ladder branch added a migration. Running its tests moved the local test database
(`float_test`, port 55432) to the new revision, because the test setup upgrades to head. Running
the migration by hand did the same to `float_dev`.

After that, every test run from main errored before a single test ran. Main's code does not
know the new revision, so Alembic cannot work out where the database is. Other sessions and the
agent loop share these databases, so they broke too.

## The fix

When you finish with a branch that adds a migration, step both databases back to main's head,
using the branch's code, which still knows the new revision:

```bash
cd <worktree>/backend
DATABASE_URL=postgresql+asyncpg://float:float@localhost:55432/float_test \
  ~/code/float/backend/.venv/bin/alembic downgrade <main's head>
DATABASE_URL=postgresql+asyncpg://float:float@localhost:5432/float_dev \
  ~/code/float/backend/.venv/bin/alembic downgrade <main's head>
```

`alembic heads` run from main's checkout tells you main's head. Once the PR merges, nothing needs
doing: main then knows the revision.

## Worth knowing

- The test database is on port **55432**, not 5432. `float_test` on 5432 does not exist.
- The migration's `downgrade` must work for this to be possible. Test it when you write it.
