# A child's login got into the clinician app

**Found 2026-09-10** by Peter: "i saw that i can log into the clinical portal with a teen login."
Then: "check parents cannot log into clinician portal also."

## What was wrong

The clinician app's sign-in (`apps/web/src/context/AuthContext.tsx`) took any account whose password
was right. A child's or parent's login landed on the clinician dashboard.

The server was already refusing them. Every clinician route goes through
`get_practitioner_context` (`backend/app/api/routers/patients.py`), which needs a practitioner
profile, so the pages loaded empty or with errors. No data came back. The app itself still should
never have let them in.

## Why nothing caught it

The route sweep (`backend/tests/test_route_sweep.py`) asks a child from **another** family and
looks for that family's data in the reply. A child reading their **own** record through a clinician
route shows only their own data, so the sweep sees nothing wrong. What makes that a problem is the
route, not the data: session notes and the formulation are the clinician's, even about this child.

## Fix

- `GET /auth/me` returns `is_practitioner`: whether the account has a practitioner profile. That is
  the same test the clinician routes use. The role name is not used because it reads "admin" for a
  clinician who is also an admin.
- The clinician app checks it before storing any token, and checks a saved session on load.
- `backend/tests/test_role_boundary.py` signs in as the child and as the parent of the family whose
  ids it uses, calls every clinician route, and fails if any answers below 400. With the refusal in
  `get_practitioner_context` removed, both tests fail.

## Next time

A boundary test needs a case where the intruder's own data is the data at stake. "Can they see
someone else's?" and "Can they use this route at all?" are different questions, and each needs its
own test. When a route is added for children or parents outside `/patient/` or `/parent/`, add it
to `CHILD_ROUTES` in the role-boundary test on purpose. Otherwise the test fails.
