# Tests refuse to run when DATABASE_URL and the test database share a host

**2026-11-18.** Found while building the clinician feedback link on Peter's laptop.

## Problem

With one local Postgres holding both `float_dev` and `float_test`, setting
`DATABASE_URL=...127.0.0.1:55433/float_dev` and `TEST_DATABASE_URL=...127.0.0.1:55433/float_test`
makes pytest stop before any test: "test host 127.0.0.1:55433 is the production host".

## Why

`tests/conftest.py` compares the host and port of the test URL with `settings.DATABASE_URL`, not the
database name. It is deliberately strict: on Peter's laptop `DATABASE_URL` is production.

## Fix

When running tests, set only `TEST_DATABASE_URL`. Leave `DATABASE_URL` unset. In a worktree there is
no `backend/.env`, so the backend falls back to `localhost/float`, which is a different host string.
Set `DATABASE_URL` only for the commands that need it (`alembic`, `seed_local.py`, `uvicorn`).
