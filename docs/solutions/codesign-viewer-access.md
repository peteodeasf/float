# Letting a named non-admin read an admin-only list

Found while building docs/plans/codesign-viewer.md (2026-10-21).

**One function behind both routes.** The admin route and the viewers' route both return
`_signups_by_session(db)` in `backend/app/api/routers/codesign.py`. A test compares their answers
byte for byte, so a field added to one cannot be missing from the other.

**Check the kind of login first, then the list.** `get_codesign_viewer` depends on
`get_practitioner_context`, so a parent, teen or office manager is refused even if their email
were typed onto `CODESIGN_VIEWERS` by mistake. An email list on its own would let any account with
that email through.

**Where the email check lives.** `can_view_codesign` is in `app/services/codesign_viewers.py`, not
in the codesign router. The codesign router imports `patients.py` for the clinician check, and
`patients.py` needs the same email check for `/practitioners/me`. Putting it in either router makes
the two import each other.

**The clinician sign-in used to forget where you were going.** `ProtectedRoute` sent anyone not
signed in to `/login`, and `LoginPage` always went to `/dashboard` afterwards. A link to any
clinician page landed on the dashboard. `ProtectedRoute` now passes the page in the router's
`state`, and `LoginPage` goes back to it, only if it is a path inside the app (starts with one `/`).
A signed-in session that expires is still sent to `/login` by `api/session.ts` without this, so it
lands on the dashboard after signing in again.

**Screenshots on the Mac mini while another session has the app open.** Ports 8000 and 5173 may
belong to another session. Run on other ports, and tell the backend which web address may call it:
`ALLOWED_ORIGINS='["http://localhost:5181"]' uvicorn ... --port 8011` and
`VITE_API_URL=http://127.0.0.1:8011 npx vite --port 5181`.
