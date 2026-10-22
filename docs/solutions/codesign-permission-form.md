# The co-design permission form: what had to be worked out

Found while building the real permission form (docs/plans/codesign-signup.md, 2026-10-21).

**One copy of the form's wording, on the server.** The page on floatcbt.com shows the form, and
the parent is emailed a copy with their answers. If the text lived in the page's HTML and again
in Python, the two would drift. So it lives only in `backend/app/services/codesign_form.py`. The
page fetches it from `GET /codesign/permission/{token}` and builds the form from it, using
`textContent` only. The copy email is built from the same text.

**A version label for the wording.** `FORM_VERSION` is Peter's date plus a short hash of every
word in `codesign_form.py`, so any edit changes it without anyone having to remember. The page
sends back the version it showed. The server refuses a version that is not the current one (409,
"please reload"), so a record never claims agreement to wording the parent did not see.

**The privacy test and "prefill the email" pull in opposite directions.** The link must not give
away the parent's or teen's email, surname or age. So the page cannot prefill the parent's email.
The email field is optional instead, and blank means the address the link was sent to. The copy
always goes to that address, never to one typed on the page: it holds the teen's full name and
age, and a typo must not send those to a stranger.

**Declined frees the seats at once.** Seats count `permission_given_at` (confirmed), or a sign-up
inside its 3 days *with no answer yet* (`form_submitted_at` null). Without the second condition,
a declined sign-up would hold its seats until the 3 days ran out.

**How floatcbt.com is deployed.** It is a separate Netlify site, not built from this repo. The
repo's `netlify.toml` builds only the app (`apps/web`). On 2026-10-21 the live
`floatcbt.com/codesign/permission/` was byte-for-byte the repo's file, so it is uploaded by hand
from `Float-website/`. The page calls the production backend directly. So the backend must go
live first: the new page does not work with the old backend, and the old page does not work with
the new one.

**Local screenshots of the website page.** The page has the production API address written in.
Copy `Float-website/` to a folder in `/tmp`, swap the address for the local backend, serve it with
`python3 -m http.server`, and add that origin to the backend's `ALLOWED_ORIGINS`. Do not edit the
repo copy.

**Another session's migration had stranded both shared databases.** Both `float_test` and
`float_dev` were on a revision from another session's branch, so this branch's tests could not
run (see branch-migration-strands-shared-test-db.md). Do not step their databases back while
they may be using them. Make your own instead: `createdb -h localhost -p 55432 -U float
float_test_<task>` and run the tests with `TEST_DATABASE_URL` pointing at it. For screenshots,
`pg_dump` `float_dev` into your own database. Undo the other branch's migration there by hand,
then upgrade with your branch.
