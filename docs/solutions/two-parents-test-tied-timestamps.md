# The two-parents test failed at random: tied time stamps

**2026-10-29.** `tests/test_two_parents.py` failed now and then in CI on PRs that changed no backend
code (#64, #97 and others).

## Why

`GET /patients/{id}/parents` sorts by `ParentPatientLink.created_at`. That column was filled by
Postgres's `now()`, which is the time the **transaction** started, not the time of the insert. The
tests run both invites inside one transaction, so both links got the same time, and Postgres returned
them in either order. In the real app each invite is its own request, so it never showed there.

## Fix

`created_at` is now also given a Python default (`datetime.now(timezone.utc)`), which SQLAlchemy uses
on every insert from the app, so two links never tie. The database's `now()` default stays for rows
inserted any other way. No migration.

## Watch for

Any other list sorted only by a `now()`-filled column can do the same in tests. Python default, or a
second sort key that can't tie.
