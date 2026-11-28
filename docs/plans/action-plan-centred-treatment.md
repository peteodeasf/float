# Treatment around the action plan

**Status:** agreed direction with Peter, 2026-11-28. Steps below are built one PR at a time.

## The model

The action plan is the work the child and parent do between sessions. The clinician makes it with
the child (and parent) at the end of a session.

- **Exposures** are set up in session by the clinician with the child, and scheduled there too:
  one or more days and a time of day. Scheduling is optional.
- **Everything else** on the plan (tools and strategies, accommodations, how to help, rewards) is a
  task for the plan's period, with no date. It is ticked off any time between the plan's start and
  end.
- The plan is shared with the family when it is ready (drafts: `action-plan-drafts.md`).

## Decisions (Peter, 2026-11-28)

- The action plan does not change how an exposure is scheduled. The date and time of day stay on
  the exposure's set-up. The plan's exposure line links to the ladder step, and the schedule comes
  from that step's set-up.
- **Set-up and scheduling happen only in the clinician app,** done jointly by the clinician and the
  child. The child's app no longer sets up or schedules an exposure. The child can still record
  doing one.
- **Several days.** The clinician's set-up sheet lets you pick several days and a time of day, as the
  child's app does today. Each day is its own scheduled exposure.
- **Clinician reminders wait** until Peter has seen the new Progress tab.
- **Parent reminders** for exposures already exist (below) and carry on.

This replaces two lines in `teen-app-redesign-requirements.md` (2026-11-22): "the child can pick any
rung" and the app suggesting the next rung for the child to set up. The child no longer chooses or
sets up a rung.

## What exists today

- An exposure's set-up stores a date and a time of day (morning, afternoon, evening). The child's
  set-up can pick several days, each saved as its own exposure; the clinician's sheet takes one.
- The child's home, the parent's home, the Progress tab and the reminder emails read every set-up
  directly. Only the action plan card and the Plan tab in each family app read the plan.
- Reminder emails (`backend/app/services/reminder_jobs.py`, every 15 minutes): the child at the
  exposure's time; the parent on the morning of an exposure day when the clinician has switched on
  "Parents can see the child's progress". At most one a day per person, 8am to 8pm, no clinical
  content. **Not confirmed from the repo that the jobs service runs in production**
  (`scheduled-jobs.md` says it is a separate Railway service).
- No text messages (waiting on carrier registration), no phone notifications (native apps, not
  started), nothing for the clinician.

## Steps

1. **Scheduling only in session.**
   - **Built 2026-11-28:** the clinician's set-up sheet picks several days in the next two weeks
     and one time of day; each day is its own exposure.
   - **Later, with the child and parent app work (Peter, 2026-11-28: no family app changes this
     round):** remove set-up and "When will you do it?" from the child's app, so the child sees the
     agreed schedule and records. Until then a set-up saved with no day still waits for the child to
     pick one at home, and the sheet still offers "They pick the day at home". Clinical: who sets up
     an exposure changes (Dr. Walker review queue).
2. **Read from the plan.** The child's and parent's home screens and the reminder emails use the
   exposures on the current shared plan, with their schedules.
3. **Progress tab around the plan.** For the clinician: the current plan's items, what was done and
   missed by date, the recordings, then earlier plans. Mockup first.
4. **Reminders.** Child and parent from the plan's scheduled exposures (the existing email job).
   Clinician reminders after step 3 is reviewed. Phone notifications with the native apps.
5. **Simplify the child and parent apps around the plan.** Design first, building on
   `teen-app-redesign-requirements.md` and `mobile-app-strategy.md`.

- **Only the plan's exposures** reach the family. An exposure set up and scheduled but not on the
  shared plan is not shown to the child or parent and sends no reminder.

## Open questions

- An exposure on the plan with no schedule: not "this week", because a plan can run two weeks or
  more. Proposed: "Before {the plan's end date}", for example "Before Thu Dec 11".
- Is the reminder jobs service running in production? Not known. Check Railway for a service named
  `floatcbt-jobs` with a cron schedule.
