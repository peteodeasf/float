# Plans

One plan per feature or refactor, written **before** the code. A plan makes execution
small and gives the next session (or collaborator) a way in without re-deriving intent.

## Convention

- One file per effort: `docs/plans/<short-slug>.md` (e.g. `parent-reminders.md`).
- Write it during the **Plan** step, build from it during **Work**, and update it if the
  approach changes materially.
- When the work ships, a plan can stay as a record or be pruned — but capture any
  hard-won lesson in `docs/solutions/` first (the **Compound** step).

## Suggested shape (adapt freely)

```md
# <Feature> — plan

## Goal
What we're building and why (link the STRATEGY.md priority it serves).

## Scope
In scope / out of scope. Name what we're deliberately NOT doing.

## Approach
The plan of record — steps, key files, data/schema changes, migrations.

## Risks & non-negotiables touched
Clinical logic? Auth/role boundaries? Production migration? Flag them here so
review and sign-off aren't an afterthought.

## Verification
How we'll know it works (tests, manual checks, /security-review if warranted).
```
