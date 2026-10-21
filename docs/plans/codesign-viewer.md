# Co-design sign-ups: a read-only page for named people

**Date:** 2026-10-21 · **Status:** built, waiting for Peter's review

Peter, 2026-10-21. Sally runs the co-design sessions (docs/plans/codesign-signup.md) and needs to
see who signed up for which date. Until now only Float admins could, in the admin dashboard. Sally
is not an admin and must not become one.

The list holds teens' names, ages and emails, and their parents' names and emails. So it needs a
sign-in and is limited to named people.

## Decided (Peter, 2026-10-21)

- A page at **app.floatcbt.com/codesign/signups** in the web app.
- For a signed-in **clinician login** (the practitioner sign-in at /login) whose email is on a
  list.
- The list is a backend setting, **`CODESIGN_VIEWERS`**: emails separated by commas, set on
  Railway. **Empty by default, so nobody sees the page until Peter sets it.** Emails match ignoring
  upper/lower case and spaces.
- Peter puts his and Sally's emails in the setting himself. No email goes in code, tests or docs.
- Admins keep their view in the admin dashboard, unchanged.

## What was built

- **Backend.** `GET /codesign/viewer/signups` returns exactly what the admin route
  `GET /codesign/signups` returns. Both call one function, so they cannot drift apart. It goes
  through the normal clinician check first, so a parent's, a teen's or an office manager's login
  is refused even if their email were on the list. Then the email must be on `CODESIGN_VIEWERS`.
  Anyone else gets 403; no sign-in gets 401.
- `GET /practitioners/me` now says `can_view_codesign`, so the page can show "You don't have access
  to this list." without asking for the list.
- **Web app.** `/codesign/signups` behind the clinician sign-in. Not signed in: the normal sign-in
  page, then back to this page (this works for any clinician page now). The table is the admin
  dashboard's Co-design section, reused; it now takes how to fetch the list as a prop. No edit or
  delete controls. No link in the clinician menu.
- No writes, no new tables, no migration.

## Not decided

- Sally needs a clinician login. If she does not have one yet, Peter creates it in the admin
  dashboard like any clinician's. That login also opens the rest of the clinician app, with no
  patients unless someone shares one with her.
