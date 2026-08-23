# "I deleted every situation but they're still there"

**Date:** 2026-08-23 · **Surface:** clinician Plan tab (treatment plan builder) ↔ session mode

## Problem

Delete every situation from the Plan-tab builder; they disappear. Open session mode; they are back.
Nothing was actually failing — no error, no 500, the deletes had committed.

## Root cause

`trigger_situations.is_placeholder` marks rows that exist as containers rather than as clinical
situations. **Every clinician-facing surface filters them out — except session mode.**

- `PatientPage.tsx`: `const triggers = rawTriggers?.filter(t => !t.is_placeholder)`
- `patients.py` (status counts): `TriggerSituation.is_placeholder.is_(False)` twice
- `SessionPage.tsx`: no filter

So the builder was never showing the placeholders in the first place. "Delete all" deleted every
row the clinician could *see*; the placeholders stayed, and session mode — the one surface without
the filter — rendered them. The symptom read as a broken delete, which sent the investigation
straight at the delete path (recently changed, and previously genuinely broken — see
[`delete-fails-silently-no-fk-cascade.md`](delete-fails-silently-no-fk-cascade.md)). That was the
wrong tree.

## Fix

`SessionPage.tsx` applies the same filter when sorting the plan's situations.

Not fixed in `getTriggers()` itself, which would have been the tempting one-liner: two of its four
callers (`PatientPage.tsx:1700`, `:1744`) are extraction/dedup paths that need the *unfiltered* set,
so that they don't recreate a situation that already exists as a placeholder. The filter is a
display concern, so it belongs on the display surfaces.

## How to avoid this next time

1. **A row-visibility rule is a contract, and every surface has to be in on it.** `is_placeholder`,
   `is_active`, soft-delete flags — the moment one is filtered client-side on one page, every other
   page reading the same table has to agree or they will silently disagree about what exists.
   Before adding a surface over an existing table, grep the flag: `grep -rn "is_placeholder" apps/web/src backend/app`.
2. **"The write didn't take" is often "the two screens disagree about what to show."** When a change
   looks lost, check whether the surface that shows the stale state is filtering differently, before
   digging into the mutation. Cheap to rule out, and it was the answer here.
3. Session mode was built as a **new front door over existing data** — that is its stated design
   (`docs/plans/interactive-capture-implementation.md`, "most of this already exists"). The cost of
   that approach is exactly this: display rules that lived in the old front door don't come along
   automatically.
