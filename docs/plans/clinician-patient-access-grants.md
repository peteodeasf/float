# Clinician access to a patient must be granted, not assumed

**Raised** 2026-08-26 in `docs/backlog.md`. **Planned** 2026-08-28.
**Gate:** `/security-review` before it ships — non-negotiable #2, not relaxed pre-launch.

## Today

Any clinician can open any patient in their institution. `get_patient_by_id`
(`app/services/patient_service.py:80`) filters on `organization_id` and nothing else.
`PatientProfile.primary_practitioner_id` exists but is only ever read to *display* who the clinician
is — it never restricts anything.

This was a deliberate simplification. It is now a gap: a clinician should have to enable another
clinician's access to their patient.

## What grounding turned up

- **37 clinician endpoints take a `patient_id`**, across 11 routers. Only **16** go through
  `get_patient_by_id`. Seven routers — `action_plans`, `experiments`, `formulation`, `messages`,
  `monitoring`, `progress`, `session_notes` — never call it. They filter their own tables by
  `organization_id` directly and never look at the patient row at all.

  So fixing `get_patient_by_id` alone leaves roughly 21 endpoints unguarded. That is the whole
  reason this needs a dependency rather than a service-layer edit.

- **Every one of the 16 call sites passes `practitioner.organization_id`.** There are no
  patient-facing or parent-facing callers to work around.

- **Every patient already has a `primary_practitioner_id`** — 35 patients, zero nulls. The backfill
  is one INSERT ... SELECT with nothing to decide.

- Production is 3 practitioners, 35 patients, one institution ("Test School"), 1 admin user.
  All test data.

## Decisions taken (Peter, 2026-08-28)

1. **An institution admin sees every patient in their institution**, no grant needed. Clinics need
   someone who can cover and reassign. The cost is a permanent bypass, so the admin path must be
   explicit in the code and covered by its own test — not an accident of how a query is written.
2. **A grant lasts until it is revoked.** No expiry. The "cover me while I'm on leave" case is
   real but not urgent pre-launch; adding `expires_at` later is a nullable column and one more
   condition. Written down here so it is a deferral, not an oversight.

## Design

### The grant

`patient_access_grants`

| column | |
|---|---|
| `id` | uuid pk |
| `patient_id` | fk `patient_profiles`, not null |
| `practitioner_id` | fk `practitioner_profiles`, not null |
| `granted_by_practitioner_id` | fk, nullable — null means the backfill created it |
| `organization_id` | fk, not null — lets the grant be scoped without a join |
| `created_at`, `revoked_at`, `revoked_by_practitioner_id` | |

Revoking sets `revoked_at` rather than deleting the row, so who had access when is answerable
later. A partial unique index on `(patient_id, practitioner_id) WHERE revoked_at IS NULL` keeps one
live grant per pair while allowing a re-grant after a revoke.

### The enforcement point

One FastAPI dependency, used by every clinician route that names a patient:

```python
async def get_permitted_patient(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
) -> PatientProfile:
```

It resolves the patient, confirms the institution matches, and then allows the request only if the
caller is an admin of that institution or holds a live grant. Anything else raises **404, not 403** —
a clinician should not be able to learn that a patient exists in another caseload by probing.

A dependency rather than a service call, because the failure being fixed is precisely that a
service call is easy to forget. `Depends(...)` sits in the signature where it is visible in review,
and a route that omits it is visible as a missing line rather than as an absent call buried in a
handler.

`get_patient_by_id` keeps its current behaviour for internal and non-clinician use, but every
clinician-facing caller moves to the dependency.

### The roster

`list_patients` returns the caller's granted patients plus, for an admin, everyone in the
institution. Without this the fix is cosmetic: the names, and who is anxious about what, leak from
the list even when the detail pages are locked.

### Granting and revoking

`POST /patients/{patient_id}/access` and `DELETE /patients/{patient_id}/access/{practitioner_id}`.
A clinician who holds a grant can grant to another clinician in the same institution; an admin can
grant for anyone. You cannot revoke the last live grant on a patient — that would strand them.

## How we will know it worked

The mechanism is the route sweep (`tests/test_route_sweep.py`), not hand-picked tests. It already
walks every registered route as each wrong identity. Extend it so a clinician **in the right
institution but without a grant** is one of those identities, and assert every patient-scoped route
refuses them. New routes are then covered without anyone remembering.

Specific tests:
- A clinician without a grant gets 404 from every patient-scoped route, including the 21 that never
  called `get_patient_by_id`.
- A clinician with a grant gets through.
- An admin gets through without a grant.
- An admin from a *different* institution does not.
- The roster excludes patients the caller has no grant for.
- Revoking the last grant on a patient fails.
- The existing organisation-scoping tests still pass.

## Order of work

1. Model, migration, backfill from `primary_practitioner_id`.
2. `get_permitted_patient` and the grant service.
3. Apply the dependency to all 37 endpoints; roster filtering.
4. Extend the route sweep; write the tests above.
5. `/security-review`.
6. **Then** the UI for granting and revoking, as a separate piece of work.

Steps 1–5 close the hole. Step 6 makes it usable: until it ships, access can only be changed by the
backfill's own grants, which is safe but means nobody can hand a patient over. Worth knowing before
this is deployed to anyone who is actually using it.

## Not doing

- **Expiring grants** — see decision 2.
- **Reassigning a caseload when a clinician leaves.** Real, and painful to retrofit, but it is a
  workflow question and this change is the boundary it would sit on. Stays in `docs/backlog.md`.
- **An access audit log** — who *opened* which record, as opposed to who is permitted to. HIPAA
  wants it eventually. It is a different mechanism from grants and should not be bolted on here.
