# Backend tests

## Running them

```bash
# once per machine boot — starts Postgres 18 on port 55432
docker compose -f docker-compose.test.yml up -d

./.venv/bin/python -m pytest
```

`docker compose -f docker-compose.test.yml down -v` stops it and throws the data away.

**If `docker` is not found:** Docker Desktop on Apple Silicon puts its CLI inside the app bundle and
does not always symlink it. Add this to your shell profile:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## How it is wired

- **A local Postgres 18 in Docker**, matching the production server version. Port 55432 rather than
  5432 so it cannot collide with anything else listening.
- **The schema is built by running the real migrations**, not `create_all` from the models. Railway
  runs `alembic upgrade head` on every deploy, so a migration broken in a way the models don't
  capture would otherwise pass every test and fail in production. Building from migrations means
  every test run also proves the migrations apply cleanly from empty.
- **Each test runs inside a transaction that is rolled back.** Tests can't see each other's rows,
  nothing accumulates, no cleanup code.
- **The engine fixture is function-scoped.** asyncpg binds connections to the event loop that
  created them and pytest-asyncio gives each test its own loop; a session-scoped engine hands the
  second test a connection from the first test's loop and fails.

## The guard

`conftest.py` refuses to run if the target host is the production host. It matters: `.env` points
at production, so a careless change to how the URL resolves would send a whole test run at real
patient data. The failure mode is "tests refuse to start", never "tests wrote to production".

Related: `migrations/env.py` used to overwrite `sqlalchemy.url` from settings unconditionally, so
*any* attempt to point Alembic at another database silently targeted production instead. It now
honours `ALEMBIC_DATABASE_URL` first.

## Two levels

**Service tests** call a service function directly with a test session. Cheapest, and where the
logic bugs have been.

**API tests** use the `api` fixture: the FastAPI app called in memory, no server, no deploy. Only
two dependencies are swapped — the database session, and the signed-in user via
`api.sign_in_as(user)`. `get_practitioner_context` is deliberately NOT stubbed, so its real lookup
(and its 403 for a user with no practitioner profile) is exercised.

```python
api.sign_in_as(clinician.user)
r = await api.get(f"/plans/{plan.id}/triggers")
assert r.status_code == 200
```

Use API tests for anything about permissions, routing or response shape; service tests for logic.

## The route sweep

`test_route_sweep.py` walks **every registered route** and calls it as a clinician from another
institution and as a child from another family. The victim's patient data carries a unique marker;
any response containing it is a leak, whatever the status code.

It found the cross-institution leak in `GET /patients/{patient_id}/summary` that hand-picked tests
had missed. Coverage is reported every run:

```
[foreign_clinician]   called 132, uncoverable 0, leaks 0
[other_family_child]  called 47,  uncoverable 0, leaks 0
```

A route it cannot reach is reported as NOT COVERED and must be fixed by teaching `_param_values`
the missing path parameter — it never passes silently. The child reaches fewer routes because most
refuse a patient outright, which is correct.

Two lists live in that file because they exist nowhere else:

- **`PUBLIC`** — routes with no authentication at all, deliberately: health, the four auth routes,
  waitlist, and the monitoring form a parent opens from an emailed link (guarded by an unguessable
  token in the URL rather than a login).
- **`SELF_ONLY`** — routes that act on the caller rather than on anything named in the path.

Shared vocabulary (tags, tips) deliberately carries no marker: returning it to any clinician is
correct, and marking it would report a working route as a leak.

## What is covered

`test_api_org_scoping.py` — the parent/child/clinician boundary (non-negotiable #2), through the
real routes. Anonymous requests, a clinician reading their own organisation, and four ways a
clinician from another organisation must fail to read, delete or edit.

`test_situation_delete.py` — deleting a situation. This is where two live bugs were found:
the original IntegrityError (nothing cascades in the schema), and an AttributeError introduced by
the fix for it (`Experiment.trigger_situation_id` does not exist). Both shipped to production; the
second was caught by the first test written.
