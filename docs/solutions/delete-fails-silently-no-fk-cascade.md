# "Click Yes to delete — nothing happens"

**Date:** 2026-08-21 · **Surface:** clinician Plan tab (treatment plan builder), session mode

## Problem

Deleting a **situation** from the ladder appeared to do nothing: the red confirmation strip opened,
"Yes" did nothing visible, the situation stayed. No error, no toast, no spinner. Separately, there
was **no delete affordance at all** on a top-level ladder rung (behavior) — only on sub-steps.

## Root cause

Two independent causes that presented as one "delete is broken" report.

### 1. No `ON DELETE` behavior on the FKs, so the delete 500s

`delete_trigger` did `await db.delete(trigger)` — and **nothing that points at `trigger_situations`
cascades in the schema.** The only FK with `ondelete="CASCADE"` is `trigger_situation_tags`
(`models/jit_content.py`). Every other referrer is a plain `ForeignKey(...)`, i.e. Postgres
`NO ACTION`:

| Table | Column |
|---|---|
| `avoidance_behaviors` | `trigger_situation_id` (NOT NULL) |
| `exposure_ladders` | `trigger_situation_id` (NOT NULL) |
| `downward_arrows` | `trigger_situation_id` |
| `experiments` | `trigger_situation_id` |
| `accommodation_behaviors` | `trigger_situation_id` |

So any situation that had been *worked on at all* raised an `IntegrityError` → 500. Session mode
makes this near-certain: `SituationPhase` calls `createSituationDownwardArrow` on entry, so simply
opening a situation gives it a referrer.

The same shape existed one level down for behaviors: `avoidance_behaviors.parent_behavior_id`
(sub-steps), `ladder_rungs.avoidance_behavior_id`, and `experiments.avoidance_behavior_id` all block
a plain delete.

### 2. The UI had no `onError`, so the 500 was invisible

Both mutations only had `onSuccess`. React Query swallowed the rejection into `mutation.error`,
which nothing rendered. A failing request and a no-op look identical to the user.

## Fix

- `delete_trigger` (`backend/app/services/trigger_situation_service.py`) and a new
  `cascade_delete_behaviors` (`backend/app/services/avoidance_behavior_service.py`) unwind
  dependents explicitly, with a policy split:
  - **Structure goes** — sub-behaviors, ladder rungs, the exposure ladder, its review flags, and the
    situation's downward arrow only describe the thing being deleted.
  - **History is unlinked, not destroyed** — `experiments` and `accommodation_behaviors` keep their
    rows; only the nullable FK is set to `NULL`. Removing a rung must not erase what the child
    actually did.
- `Del` added to top-level ladder rungs (`PatientPage.tsx`), reusing the delete-confirm branch that
  already existed but had no way to be reached.
- `onError` + a pending label on both delete mutations, so a failure says so.

## How to avoid this next time

1. **A plain `db.delete(row)` on a parent row is a latent 500 in this schema.** Almost nothing here
   declares `ondelete`. Before adding or trusting a delete endpoint, grep for referrers:
   `grep -rn 'ForeignKey("<table>.id"' backend/app/models/` — and decide, per referrer, whether it is
   *structure* (delete) or *history* (unlink).
2. **Every destructive mutation needs an `onError`.** Silent failure is the worst outcome: the
   clinician retries, assumes the app is broken, or worse, assumes the data is gone when it isn't.
3. **Consider fixing the schema, not each call site** — adding `ondelete` to these FKs would remove
   the whole class of bug. Not done here deliberately: Railway auto-migrates on deploy against the
   production database, so a schema-wide cascade change is a bigger blast radius than the service
   change it replaces. If it's ever done, do it as its own reviewed migration.
