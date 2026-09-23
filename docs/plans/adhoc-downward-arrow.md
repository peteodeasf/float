# Ad-hoc downward arrow — standalone, off the ladder

**Date:** 2026-09-23 · **Status:** plan, not started

## Goal

Let a therapist run a downward arrow on its own, whenever they want, without it being part of
building the exposure ladder. The flow starts by typing a situation and follows the chain down
from there, exactly like the existing arrow. The result lives in the patient's record but is
**not** attached to the exposure plan. Later, the therapist can choose to bring it onto the
plan — but nothing forces that.

## Why the data model already mostly supports this

The arrow was already decoupled from the plan for the parent version:
- `downward_arrows.trigger_situation_id` is nullable, and there's a direct `patient_id`
  (`backend/app/models/downward_arrow.py`). An arrow can belong to a patient with no situation
  and no plan link.
- The whole flow — next-probe phrasing, the `arrow_steps` chain, `feared_outcome`, approval —
  is plan-independent already.
- Patient-scoped endpoints exist: `GET`/`POST /patients/{id}/downward-arrows`.

What's missing is only: (1) a place to store the typed situation, and (2) a create path that
makes a **new** arrow each time instead of reusing one.

## The one schema change

Add a nullable `situation_text` column to `downward_arrows` — the therapist's typed situation
for an ad-hoc arrow. Null for plan-linked arrows (they get their situation from the trigger
situation's name) and for the parent arrow (situation-less).

- Migration on top of head `b7e3f1a9c2d4`. Additive and nullable, so it's safe and
  non-destructive. Verify it renders offline (`alembic upgrade b7e3f1a9c2d4:<rev> --sql`),
  has the right `down_revision`, and the app boots.

This also becomes the discriminator between the three situation-agnostic arrow shapes:
- **Ad-hoc** — `trigger_situation_id` null, `situation_text` set, `facilitated_by` =
  'practitioner'. Many per patient.
- **Pre-ladder anchor** (legacy, get-or-create, not currently called from the UI) —
  `trigger_situation_id` null, `situation_text` null, `facilitated_by` = 'practitioner'. One
  per patient.
- **Parent arrow** — `facilitated_by` = 'parent', `situation_text` null.

To keep the get-or-create anchor from ever picking up an ad-hoc arrow, scope its lookup query
with `situation_text IS NULL` (`get_or_create_patient_downward_arrow` in
`backend/app/services/downward_arrow_service.py`). (Low risk today since the anchor isn't
called from the UI, but correct either way.)

## Backend

- **Create (new, not get-or-create):** a path that always inserts a fresh patient-scoped arrow
  with `situation_text`, `trigger_situation_id` null, `facilitated_by` = 'practitioner'. Either
  a new endpoint (e.g. `POST /patients/{id}/downward-arrows/ad-hoc`) or a flag on the existing
  patient create that switches it from get-or-create to create-new. New service function
  alongside `get_or_create_patient_downward_arrow`.
- **List:** `GET /patients/{id}/downward-arrows` already returns all of a patient's arrows.
  Add `situation_text` to `DownwardArrowResponse` so the list can show it. The UI filters to
  ad-hoc ones (situation set, no trigger situation).
- **Update / next-probe / approve:** unchanged — reuse the existing `PUT /downward-arrows/{id}`
  and `/downward-arrows/next-probe`. No new clinical logic; the probe behaviour Dr. Walker is
  reviewing is untouched.
- **Access control:** reuse `get_permitted_patient` / `get_permitted_arrow`. Clinician-scoped,
  same as the existing arrow endpoints — no change to the parent/child/clinician boundary.

## Frontend

- **New "Tools" menu (decided).** Add a top-level **Tools** item to the clinician nav
  (`PractitionerNav.tsx`, alongside My Patients / Education / Settings) with a new `/tools`
  route and `ActivePage` value. Tools is patient-agnostic: you enter it first, then pick a
  patient. The ad-hoc downward arrow is its first tool; the menu is built to hold more later.
- **Flow:** Tools → choose "Downward arrow" → **select an existing patient** → type the
  situation → run the chain → save. The patient picker draws from the patients the clinician
  has access to (the same list the dashboard uses). After picking a patient it also shows that
  patient's existing ad-hoc arrows, so the therapist can reopen one instead of starting fresh.
- **Reuse `ArrowPage`** (`/patients/:patientId/arrow`) for the chain itself. It already runs
  intro → pick situation → chain → confirm. Add an ad-hoc mode (e.g. `?adhoc=1`) where, instead
  of picking an existing plan situation, the therapist **types** the situation; the same chain
  then runs and save creates the ad-hoc arrow. Tools navigates here once a patient is chosen.
- **Review in the record too:** the ad-hoc arrows live in the patient record, so also list them
  there (situation + feared outcome, date), each reopenable. `listPatientDownwardArrows`
  already fetches them.

## Promote to the plan (later, optional)

Because `trigger_situation_id` is just nullable, an ad-hoc arrow can later be attached to a
situation on the plan. Out of scope for the first build; note it as the natural next step.

## Review + sign-off

- Run `/security-review` — it adds a data-access endpoint returning patient clinical data
  (non-negotiable #2, even though it reuses existing permission deps).
- No clinical sign-off needed for the mechanism: the arrow's behaviour is identical to the
  existing one. If the ad-hoc arrow ever changes probe phrasing or how a feared outcome is
  used, that would need Dr. Walker.

## Build order

1. Migration: add `situation_text`; scope the anchor get-or-create to `situation_text IS NULL`.
2. Backend: create-new service + endpoint; add `situation_text` to the response.
3. Frontend: new **Tools** nav item + `/tools` page with a patient picker; ad-hoc mode in
   `ArrowPage` (type a situation); list ad-hoc arrows in the patient record too.
4. `/simplify` → `/code-review` → `/security-review`.
