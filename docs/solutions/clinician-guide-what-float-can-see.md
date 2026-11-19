# What the clinician guide can and cannot tell from Float's data

**2026-11-19.** Worked out while updating the clinician guide (`docs/plans/clinician-guide.md`,
"Version 2"). The guide ticks a goal itself only when Float's data can show it is done. Three
things looked trackable and were not, or not in the obvious way.

## A rung is not a behavior

`GET /plans/{id}/rungs` returns only `scenario` and `combination` rows (`LADDER_TYPES` in
`backend/app/core/behavior_types.py`). The safety, avoidance and ritual behaviors the child does are
separate rows, read per situation from `GET /triggers/{id}/behaviors`. Counting rungs to answer "are
the behaviors written down for each situation" gives the wrong answer. The guide filters the
behaviors list, leaving out `scenario`, `combination` and `observation`.

## Float cannot tell who was in the room for a downward arrow

`DownwardArrow.facilitated_by` looks like it says whether the arrow was done with the parents or the
child. It does not. The clinician app always saves `practitioner`
(`createSituationDownwardArrow` and `openStepArrow` in `apps/web/src/api/treatment.ts`). Only the
parent app saves `parent`. So "the downward arrow with the child" is a goal the clinician ticks.

## Practice in session is not recorded

Session mode records nothing about practicing an exposure in the room. An exposure only becomes
`completed` when the child or parent logs it after doing it for real. So a completed exposure is a
safe sign the patient is in weekly sessions, and "practiced in session" is ticked by the clinician.

## Where the clinician's ticks live

In the patient's existing checklist record (`consultation_checklists.checked_items`), under keys
starting `guide:`. The checklist route accepts any key and already checks access. Nothing reads
every key in that record, so the guide's keys do not change the process checklist's counts. Renaming
a goal's key in `clinicianGuide.ts` loses its saved ticks.
