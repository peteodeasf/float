# Parental consent never reached the Teen Access panel

**Found 2026-09-10. Broken since 2026-08-10**, when the consent step was added. A clinician pressed
"Record consent (obtained offline)" eight times and the panel did not change.

## The cause

Two separate faults, and either one on its own would have blocked the teen invite.

1. **Recording consent failed after saving.** `POST /patients/{id}/child-connect-consent` saved the
   consent, committed it, then returned the database row. The reply requires an email, and the
   email is on the login account, not the patient row. So building the reply failed and the
   request came back as a server error — every time, with the consent already saved.

2. **The patient page never received the consent date.** `GET /patients/{id}` built its reply by
   hand and left out `child_connect_consent_at`. So even after consent was saved, and even after a
   reload, the panel showed "Awaiting parent consent" and kept "Send invite" disabled. This applied
   to every patient, however consent was given — the monitoring form included.

The panel made it look frozen: it had no error message, so a failed save just reset the button.

No test called either endpoint for consent.

## The fix

One function, `_patient_response`, now builds the patient reply for all four endpoints that send
one — create, load, save, and record consent. It includes the email and both consent fields. The
panel says so when a save or an invite fails.

## How to avoid it

- When several endpoints send the same shape back, build it in one place. Four hand-built copies
  meant a new field was added to the shape and to none of the copies.
- An endpoint that returns a database row against a reply shape will fail if the shape needs
  something the row does not have. Build the reply explicitly.
- A button that sends something needs to say when it fails.
- When a request "does nothing", check the server log before the screen. The log showed eight
  saves and eight errors, which settled it in one step.
