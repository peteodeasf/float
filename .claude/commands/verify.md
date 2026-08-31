---
description: Run everything that has to pass before work is called done — backend tests, typecheck, frontend build.
---

Run these four, in order, and report the result of each.

**Do not stop at the first failure** — run all three, so the report is complete.

## 1. Backend tests

The test database has to be up first. It is a local container and starting it twice is harmless.

```bash
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
cd backend && docker compose -f docker-compose.test.yml up -d
./.venv/bin/python -m pytest tests/ 2>&1 | tail -20
```

**Read the last line, not the line above it.** pytest prints failures before the summary, and
"4 failed, 75 passed" is a failure. This has been misread before.

## 2. Typecheck

```bash
cd apps/web && npx tsc -b --force
```

**`tsc -b`, not `tsc --noEmit -p tsconfig.json`.** The root config has `"files": []`, so
`-p tsconfig.json` checks nothing at all and passes silently. It reported clean for a whole session
while a page was broken at runtime.

No output means it passed.

## 3. Frontend tests

```bash
cd apps/web && npm test
```

The first run after installing takes a few minutes while it compiles; after that it is under a
second.

## 4. Frontend build

```bash
cd apps/web && npm run build
```

## Then say plainly

For each: passed, or what failed. If anything failed, the work is not done — say so rather than
describing it as done with a caveat.

## What this does NOT prove

- **Nothing about how a screen LOOKS.** The frontend tests know what the text says; they do not
  know the column is cut off, the colours are wrong, or the control is somewhere nobody will find
  it. If the change is visible in the browser, open it and look — `preview_start`, then a
  screenshot.
- **Nothing about production.** These run locally against a test database.
