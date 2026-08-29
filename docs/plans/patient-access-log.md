# Who opened which patient record

**Planned 2026-08-29.** From `docs/backlog.md`, HIPAA item 1.
**Gate:** `/security-review` before it ships.

## The problem

We control who is *allowed* to open a patient record. We do not record who actually opened one.

HIPAA requires that record. And a patient can ask for a list of everyone who saw their file — today
we could not produce one.

## Where it goes

Every clinician read of a patient goes through **one function**:
`get_patient_for_practitioner` in `backend/app/services/patient_access_service.py`.

All thirteen `get_permitted_*` dependencies call it, directly or through `_require`. So one write
there covers all 39 clinician routes, and any route added later gets it without anyone remembering.

That is the same property that made the access check work, and the same reason it is the right
place.

## What gets recorded

| | |
|---|---|
| which patient | |
| which user, and their clinician record | |
| which institution | |
| what they were doing | the request method and path |
| when | |
| how they got in | a grant, or being an institution admin |

**"How they got in" is the one that is easy to leave out and worth having.** Institution admins
bypass grants entirely. Two of the three clinicians at Test School are admins. Without this column
you cannot tell normal access from an admin looking at a record they were never granted.

## Reading it back

`GET /patients/{patient_id}/access-log`, institution admins only.

Not every clinician with a grant: the log is who-watched-the-watchers, and letting the people it
records decide what it says is the wrong shape.

## The decision I am making, for Peter to overrule

**If writing the log fails, the request still goes through.**

The stricter reading is that access without an audit trail should be refused. I have not done that,
because a broken logging table would then stop clinicians opening patient records — a logging
problem becoming a patient-care problem. The failure is recorded in the application log instead.

Worth revisiting with whoever signs off the risk assessment.

## What this does not do

- **No consent or disclosure tracking.** This records internal access. Disclosures to outside
  parties are a separate thing.
- **No retention rule.** The table grows forever until backlog item 5 decides how long records are
  kept. HIPAA says six years for these; that decision belongs with the rest of retention.
- **Does not cover the admin app.** `DELETE /admin/patients/{patient_id}` and the rest of the admin
  routes use a different path and are not covered here. Worth a follow-up.

## How to tell it worked

- Opening a patient as a clinician writes one row: who, which patient, what, when.
- A clinician who is refused writes nothing — this records access, not attempts.
- An admin opening a record is recorded as an admin, not as a grant.
- The route sweep still passes, and the new read route refuses everyone except an institution admin.
