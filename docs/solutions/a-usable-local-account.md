# What an account needs before it can actually use the app

**2026-10-15.** Written while building `backend/seed_local.py`. A user row with a password lets
someone sign in. It does not let them see anything. Each app checks more than that.

## Clinician

All four are needed. Miss one and the clinician app shows an error or an empty patient list.

- A `practitioner_profiles` row. Every clinician route looks for it (`get_practitioner_context`).
  The role name alone is not enough.
- `users.setup_completed_at` set. Without it every clinician route returns 403 and the app sends
  them to the setup screens (`practice_service.require_ready`).
- The practice's `organizations.status` is `active`, and `suspended_at` is empty. Same check.
- A live row in `patient_access_grants` for each patient. `primary_practitioner_id` does NOT give
  access. Without the grant, the patient is missing from the list and opening them returns 404.

## Parent

- A `user_roles` row with role `parent`, and a `parent_patient_links` row to the child. `/auth/me`
  finds the child through the link only.

## Child

- A `patient_profiles` row whose `user_id` is the account, and role `patient`.

## Float admin

- A `user_roles` row with role `admin`. It can be in any organisation. The seed puts it in its own
  organisation, "Float", so it is not part of the demo practice.

## Seeding in tests

`seed()` only flushes and never commits. The script commits in `main()`. That way the test's `db`
fixture can roll everything back, and the same function is what runs on a real local database.

`tests/test_seed_local.py` signs in as each account through the API. If a future change adds a fifth
requirement to any list above, that test fails before anyone's local demo data does.
