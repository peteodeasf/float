# Feedback link in the clinician app

## Goal

A clinician can tell us about a problem or an improvement from any page of the clinician app. Each
piece of feedback is saved in Float and becomes an issue on GitHub (`peteodeasf/float`), where Trevor
(the nightly agent loop on the Mac mini, `docs/plans/agent-loop.md`) picks it up.

## Decided with Peter, 2026-11-18

- **What the issue holds:** the clinician's text as written, with no warning in the panel. Peter: no
  real patient data will be on the platform while this link exists. If that changes, this link is
  one of the places to revisit, because GitHub is outside the HIPAA boundary.
- **When it is sent:** straight after the feedback is saved, not on a timer.
- **Token:** a fine-grained token from the `odea-agent` GitHub account, limited to issues on
  `peteodeasf/float`. Peter creates it and puts it in a Railway variable. So issues show as written
  by `odea-agent`, and Trevor treats them as other people's reports: it fixes clear bugs and asks
  Peter about suggestions.
- **Label:** `ui-feedback`, so Trevor's nightly run picks them up.

## How it works

1. Clinician presses **Feedback** at the top right, types, presses **Send**.
2. `POST /feedback` saves a row in a new `clinician_feedback` table: who, which page, the text,
   when. It answers as soon as the row is saved.
3. Straight after the answer, the backend creates the GitHub issue and writes the issue number on
   the row.
4. If GitHub fails or the token is not set, the row stays unsent. The scheduled-jobs service
   (`floatcbt-jobs`, every 15 minutes) sends any unsent rows. This is a retry only; Peter's choice
   of "send straight away" is what normally happens.

A row is locked while it is being sent (`FOR UPDATE SKIP LOCKED`), so the request and the
15-minute job cannot both create an issue for it.

## The issue

- Title: `Clinician feedback: <first line, cut to 70 characters>`.
- Body: the text, the page address it was sent from, the time, and the Float row ID. Not the
  clinician's name or email: Peter can look them up by the row ID if he needs them. A line at the
  top says it was written by a clinician in Float.
- Label: `ui-feedback`.

## Where the link goes

Every clinician screen behind sign-in:

- the shared top bar (`components/ui/PractitionerNav.tsx`): patients list, patient page, progress,
  monitoring report, education, settings, co-design sign-ups;
- the session-mode bar (`Chrome` in `pages/practitioner/sessionKit.tsx`): Tools, downward arrow,
  session;
- the Add-patient page's bar and the Record-session page's bar, which have their own.

Not on the practice screens or the setup steps: those are for office managers and people still
setting up, who are not clinicians using the app yet. The endpoint takes clinicians only.

The panel slides in from the right, full height, about 400px wide (full width on a phone). One text
box, **Send** and **Cancel**. After sending it says "Thanks — we've got it." Escape or clicking
outside closes it.

## Code

- `backend/app/models/feedback.py` — `ClinicianFeedback`.
- `backend/migrations/versions/<rev>_clinician_feedback.py` — creates the table. Not destructive.
- `backend/app/services/feedback_service.py` — saving, building the issue, sending one or all
  unsent; the GitHub call is passed in so tests fake it.
- `backend/app/api/routers/feedback.py` — `POST /feedback`, clinicians only, text 1–5,000 characters.
- `backend/app/services/reminder_jobs.py` `run_due` — also sends unsent feedback.
- `backend/app/core/config.py` — `GITHUB_FEEDBACK_TOKEN` (empty: nothing sent), `GITHUB_FEEDBACK_REPO`.
- `apps/web/src/api/feedback.ts`, `apps/web/src/components/ui/FeedbackLink.tsx`, placed in the four
  bars above.

## Tests

- A clinician's feedback is saved with the page and their user.
- A child, a parent, and someone signed out are refused. Empty text is refused.
- Sending creates one issue with the label and marks the row with its number; the GitHub call is faked.
- GitHub failing leaves the row unsent; the next run sends it. A sent row is never sent again.
- No token: nothing is sent and nothing fails.
- Frontend: the link opens the panel, Send posts the text and the page, the thank-you shows.

## Limits added after review

- The page is kept only if it is a plain path (`/patients/abc`). Anything else is stored empty, so
  it cannot add lines to the issue.
- The text is quoted (`> ` on each line), and an `@` is followed by an invisible space, so an
  `@name` does not notify anyone on GitHub. It still reads the same.
- At most 10 per clinician per hour.
- A row that fails 10 times is not retried. `last_error` says why.
- Known gap: if GitHub creates the issue but its reply is lost (a timeout, a restart), the next try
  makes a second issue. Rare; Trevor or Peter closes the duplicate.

## Risk to note

Trevor reads issue text. A clinician could write something that reads like an instruction to it.
Trevor's prompt already treats non-Peter reports as reports, not orders, and asks Peter about
anything that is not a clear bug. Clinicians are approved by Peter before they can sign in.

## Peter does after merge

1. Create a fine-grained token on `odea-agent`: repository `peteodeasf/float`, permission Issues:
   read and write, nothing else.
2. Add `GITHUB_FEEDBACK_TOKEN` to the backend service on Railway. On `floatcbt-jobs`, add a
   variable `GITHUB_FEEDBACK_TOKEN` that references the backend's, as its other variables do,
   so the 15-minute retry can send too.
