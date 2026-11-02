# Co-design: keeping high school and college apart

**2026-11-02.** Worked out while adding college sign-ups (docs/plans/codesign-signup.md, "College
students").

**The database keeps the groups apart, not only the code.** Each session and sign-up has an
`audience`. The sign-up's `(session1_id, audience)` and `(session2_id, audience)` are foreign keys
to `codesign_sessions (id, audience)`, which needed a unique constraint on that pair. So a high
school sign-up on a college session is refused by Postgres even if a route forgets to check. A
foreign key with a NULL in it is not checked, which is what college's empty `session2_id` needs.

**A CHECK constraint passes on NULL.** `CHECK (audience <> 'college' OR (agrees_to_recording AND
...))` lets a college row through with `agrees_to_recording` empty, because `NULL` is not `false`.
Write `agrees_to_recording IS TRUE`. Same for any boolean you mean to require.

**Columns that became nullable for college are still required for high school**, by a second
CHECK. Without it, making `parent_email` nullable would quietly let a high school sign-up be saved
without a parent.

**The old page keeps working until the website is uploaded.** The routes without "college" in
them (`GET /codesign/sessions`, `POST /codesign/signups`) stay high school only, and the admin
list keeps high school under `sessions` with college added under `college_sessions`. So the live
website and the app both work during the minutes between the backend going live and the new
pages being uploaded.

**Two sign-ups in one test get the same `created_at`.** `now()` in Postgres is the start of the
transaction, and each test runs inside one. The list orders by `created_at`, so two sign-ups made
in one test come back in either order, and a test that checks the order fails about one run in
five. Move the first one back a minute in the test. Real sign-ups are separate transactions.

**End-to-end on the Mac mini.** `float_dev` was on an older revision and is shared with other
sessions, so it was copied (`pg_dump` into `float_dev_college`), migrated there, used, cleaned and
dropped. The website copy and the app pointed at a backend on port 8010, with `ALLOWED_ORIGINS`
set for the website copy's port (see codesign-permission-form.md and screenshots-on-the-mini.md).
The date buttons hide a real radio input over each label, so Playwright must click the input,
not the label.
