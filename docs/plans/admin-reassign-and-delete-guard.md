# Admin: reassign a patient, and guard clinician deletion

**Date:** 2026-09-23 · **Surface:** platform admin dashboard (Users + Patients)

## Problem

Deleting a clinician in the admin dashboard 500s for any clinician who has patients or
history — the endpoint deletes `practitioner_profiles` while rows still point at it
(`patient_access_grants`, `patient_profiles.primary_practitioner_id`, `session_notes`, …).
Worse, if it *did* cascade blindly it would orphan live patients (a patient with no clinician).

Peter's decision: a clinician with patients must **not** be deletable — refuse with a clear
message. To make deletion possible, add an admin action to **reassign a patient** to another
clinician first.

## Design

### Reassign a patient (new)
`POST /admin/patients/{patient_id}/reassign` body `{ clinician_id }`.
Moves the *care relationship* from the patient's current clinician to the target:
- `patient_profiles.primary_practitioner_id = target`
- `treatment_plans.practitioner_id = target` for that patient's plans
- access grants: give the target a live grant if it has none; revoke the previous primary's
  live grant to this patient

Guardrail: the target clinician must be in the **same organization** as the patient
(403 otherwise). This keeps the parent/child/clinician data boundary — you can't move a
patient across orgs by reassigning.

### Delete guard (changed)
`DELETE /admin/users/{user_id}`, practitioner branch: before deleting, count the clinician's
patients — distinct patients where they are `primary_practitioner_id`, plus any owned
`treatment_plans`, plus any live `patient_access_grants`. If > 0 → **409** with
`"Dr. X still has N patient(s). Reassign them before deleting this clinician."`

### Delete cleanup (changed)
Once the guard passes (no current patients), unwind the remaining references so the row can
go, following the repo's existing split (structure goes / history is preserved):
- **Repoint authored content to the patient's current clinician** — `session_notes`,
  `clinical_formulations`, `action_plans`, `session_recordings`, and
  `patient_profiles.recording_consent_practitioner_id`. Their `practitioner_id` is NOT NULL,
  and Peter chose to keep the notes (attributed to whoever now has the patient) rather than
  delete them. Done via `SET practitioner_id = patient.primary_practitioner_id`.
- **Delete the clinician's own artifacts** — `patient_access_log` (by profile and by user),
  their `patient_access_grants` rows (all revoked by now), and their `messages`.
- Then `practitioner_profiles` → `user_roles` → `users`.
- Defensive: if any authored row's patient has no current clinician (can't repoint a NOT NULL
  column to null), refuse with a message naming the patient rather than 500.

### Supporting reads
- `GET /admin/clinicians` → `[{ id, name, email, organization_id, organization_name }]` to
  populate the reassign dropdown.
- `list_patients` gains `organization_id` and `clinician_id` so the row can filter clinicians
  to the same org and exclude the current one.

### Frontend (`AdminDashboardPage.tsx`)
- `handleDeleteUser` surfaces `err.response.data.detail` (currently a generic alert).
- Patients table: a **Reassign** action next to Delete — inline select of same-org clinicians
  (excluding the current one) → confirm → `POST reassign` → reload.

## Out of scope
- "Deactivate instead of delete" for clinicians (the launch-correct answer for preserving
  authorship). Not needed pre-launch; noted for later.
- The same latent FK gap in `_delete_patient_cascade` (patient delete doesn't clear
  `patient_access_grants`/`patient_access_log` by patient) — separate issue.
