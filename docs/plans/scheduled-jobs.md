# Scheduled jobs: the first reminders

**Built 2026-09-10.** The Railway service is `floatcbt-jobs`: same repository and code as the
backend (root directory `backend`), start command `python -m app.jobs.run`, schedule
`*/15 * * * *` in UTC, never restarted. Those are set on the service itself — Railway no longer takes
a settings file per service. Its variables reference the backend service's, so nothing is copied.
Code: `app/services/reminder_jobs.py`, `app/jobs/run.py`.

From the backlog ("No scheduler exists"): nothing in Float runs on a timer. Reminders, the
missed-exposure check and the arrow harvest all wait on it. Decided with Peter, 2026-09-10.

## Decided

- **Email first, texts later.** Float already sends email (Resend). Texts need the US carrier
  registration for business texting (A2P 10DLC), which Peter has not started; the jobs are built so
  texts can be added without changing them.
- **A small Railway service that runs on a timer.** Peter gave permission. Same code as the backend,
  started every 15 minutes, does what is due, and exits.
- **The first three:**
  1. **The child**, on the day of each exposure, at the time of day they picked.
  2. **The parent**, once a week, to answer the weekly check-in.
  3. **The missed-exposure check**, which exists but only runs when someone presses a button.
- **Limits:** nothing before 8am or after 8pm in the family's time zone, and at most one reminder a
  day per person.

## How each one decides it is due

- **Child's exposure:** a committed exposure whose day is today where they live. It goes at the
  time stamped on the exposure — the time of day they picked (morning 9am, afternoon 2pm, evening
  7pm). One email however many are due that day.
- **Parent's check-in:** Sunday from 6pm, if their child has a weekly focus and they have not
  answered for this week.
- **Parent's heads-up on the child's exposure day** (added 2026-09-11, Peter: "parent reminder"):
  the morning of the day, from 8am where the parent lives, so they have the day to get ready. Only
  when "Parents can see the child's progress" is on — without it the parent is not told about the
  child's exposures at all. On a Sunday, if the weekly check-in is still to answer, the check-in gets
  the day's one reminder instead. The email says only that something is planned today.
- **Missed exposures:** no longer a job (2026-09-11). The notes it wrote went into a table nothing
  read; the clinician's screens now work missed exposures out from the records
  (docs/plans/clinician-notifications.md).

## Time zones

Nothing stores a family's time zone today. The child and parent apps will send it from the phone or
browser each time they open (no question asked). **Someone with no time zone recorded gets no
reminder** until they next open the app: without it, the 8am–8pm rule cannot be kept.

## What the emails say — nothing clinical

Email is not a secure channel. The reminders say only that something is waiting in Float, with a
link: *"You have something planned in Float today."* / *"Your weekly check-in is ready."* No step
names, no accommodation names, no child's name in the parent's subject line. The detail is behind
the sign-in.

Every reminder email has a link that turns reminder emails off for that person.

## Keeping it to one a day

A record of every reminder sent (who, which kind, for what, when). A reminder already sent is never
sent again, and nobody gets a second reminder the same local day.

## What goes

- The two "admin" buttons that ran reminders and the missed check by hand
  (`POST /admin/send-experiment-reminders`, `POST /admin/detect-missed-experiments`). Any clinician
  could press them, and they acted on every clinic's patients.
- The text-message reminder path. It comes back with texts.

## Not yet

- Texts.

## Also changed

**The backend no longer prints every database query with its values** (`SQL_ECHO`, off by default).
Those values are families' records, and they were going into the Railway logs; the jobs service
would have added them every 15 minutes.

## Checks

`/security-review`: a job reads every clinic's data and emails families. Tests: the time rules (local
day, 8am–8pm, one a day), what is due, never twice, no clinical words in any email, the off link.
