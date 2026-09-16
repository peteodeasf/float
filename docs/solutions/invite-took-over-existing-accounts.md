# Inviting a child or parent could take over anyone's account

**Date:** 2026-09-16

## Symptom

Found by the security review of practice onboarding, not by a user. A clinician inviting a child or
parent with an email that already had a Float account reset that account's password, added a
patient or parent role to it, and linked it to the clinician's patient. It worked for any account:
a clinician in another practice, an office manager, a Float admin. The child invite's error message
also named another patient.

## Root cause

`invite_teen` and `invite_parent` in `backend/app/api/routers/patients.py` treated "an account with
this email exists" as "this is the person being invited". The only guard was against pointing one
child login at two patients. Nothing checked whose account it was.

The attacker never received the new password (it went to the account's own inbox), but the owner
was locked out, and signing in to the child or parent app with the emailed password showed them a
child's data that wasn't theirs.

## Fix

- Child invite: an existing account is reused only if it is already this child's own login.
- Parent invite: only if every role the account has is `parent` in this practice. The password is
  not reset; the email says to sign in with their existing password.
- Anything else gets one message that says nothing about who owns the email.
- Tests: `backend/tests/test_invite_existing_accounts.py`.

## How to avoid it next time

Looking up a user by email and then changing that user is a takeover unless you have checked the
account is the one you mean. Every route that creates or links an account by email should refuse an
existing account unless it can prove the account already belongs to that family or practice. When
adding such a route, grep `User.email ==` and read each hit.
