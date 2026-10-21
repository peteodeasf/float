# Back-dating a teen's exposures: which date each screen reads

**2026-10-21.** Worked out while building the teen data testing page (`/teen-test`,
`docs/plans/teen-data-testing.md`).

## Each status is dated by a different column

An experiment has five dates, and the clinician's screens read different ones:

| Column | Set by | Read by |
|---|---|---|
| `scheduled_date` | the teen picking a day | Progress tab: the day of a set-up or too-hard exposure; "missed" |
| `completed_date` | Record done | Progress tab: graph, streak, the day of a done exposure; progress service |
| `too_hard_at` | Too hard | the attention list ("this week") |
| `committed_at` | locking it in | the patient list's "active this week", the attention list |
| `created_at` | starting it | the patient list's "last active"; the order of a rung's exposures |

So back-dating only `completed_date` is not enough to make three weeks look real. Fill in 3 weeks
also sets `created_at` and `committed_at` to the day before each exposure. Without that, every row
says it was started today, and the patient list calls the teen active this week whatever happened.

## "Missed" is not stored

Nothing writes a missed status. The Progress tab shows a `committed` or `planned` exposure whose
`scheduled_date` is before today as missed (`ExposuresTab.tsx`, `dayDots` and `DayRow`). To make
one, set an exposure up for a past day and do not record it.

## A new exposure recorded on a past day must be set for that day too

The rung's list on `/teen-test` shows each exposure by `scheduled_date`. The Progress tab shows a
done one by `completed_date`. Record done on a new exposure with "When it happened" set to last
Monday used to set it up for today and complete it last Monday — two different days on two
screens. The page now sets it up for the day it happened.

## Check the date before changing the row

`save_after_state` first set the status and only then checked the date, so a refused date raised
after the row was already changed in memory. In a request that is harmless, because the session is
thrown away. In the tests, which share one session, the change stuck. Check first, then write.

## The switch

`TEEN_DATA_TESTING` (backend setting, default off). Every route that takes a chosen date calls
`back_date` in `backend/app/core/teen_testing.py`, which refuses with the switch off and refuses a
future date (two minutes of slack for the tester's clock). It must be off before the first real
family.
