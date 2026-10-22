# Two migration heads fail the Railway deploy

**2026-10-22.** The deploy after #72, #73 and #74 built fine and then failed.

## What happened

#73 (patient maintenance) and #74 (co-design permission form) were built at the same time, by
separate agent sessions. Each added a migration on the same parent (`a4c9e2f7b1d3`). Each PR was
fine on its own, and CI passed on both, because CI only checks each branch. Once both were on main,
the migrations had two heads.

Railway runs `alembic upgrade head` before every deploy (`backend/railway.toml`). With two heads,
alembic refuses ("Multiple head revisions are present"), so the deploy fails after the build and
production keeps running the old code. Nothing in the database changes.

## The fix

A merge migration that joins the two heads and does nothing else:

    cd backend && alembic merge -m "merge ..." <head1> <head2>

Check it from production's revision: `alembic upgrade <old>` on a scratch database, then
`alembic upgrade head`, `alembic downgrade <old>`, and `alembic upgrade <old>:head --sql`.

## So it doesn't happen again

`backend/tests/test_single_migration_head.py` fails when there is more than one head. It runs in CI
on every PR. It still cannot see two PRs that are each fine alone, so after merging a PR with a
migration, check `alembic heads` on main, or rebase the second PR onto main and let CI run.
