# Backlog

Work that is agreed but not started. Each item should be actionable without the conversation that
produced it — file paths, current behaviour, what changes, how to tell it worked.

---

## Clinician access to a patient must be granted, not assumed

**Priority: high — access control, PHI.** Raised 2026-08-26.

**Today:** any clinician can open any patient in their institution. `get_patient_by_id`
(`app/services/patient_service.py`) filters on `organization_id` only. `PatientProfile` has a
`primary_practitioner_id`, but it is never used to restrict access — only read to *display* who the
clinician is (`patients.py:307, 340, 379, 1333, 1473`).

This was a deliberate simplification. The owner now considers it a gap: a clinician should have to
**enable another clinician's access** to their patient.

**What changes:**
- A patient's clinician(s) become an explicit grant, not "everyone in the institution". Probably a
  link table — one patient, many clinicians, with who granted it and when.
- `get_patient_by_id` and everything reading patient data filter by that grant as well as by
  organisation.
- A way to grant and revoke, presumably from the patient page.
- Existing rows need no care. Every patient on the platform is test data (owner, 2026-08-26), so
  backfill crudely or not at all. This becomes a real migration concern only after the first real
  patient onboards.

**Open questions:**
- Should an institution admin keep blanket access? Clinics usually need someone who can cover.
- What happens when a clinician leaves — does their caseload need reassigning before they go?
  (Not urgent pre-launch, but it is the kind of rule that is painful to retrofit.)
- Is there a "cover for me" case (holiday, sickness) that needs to be time-limited rather than
  permanent?

**How to tell it worked:** a clinician who has not been granted access gets nothing back for a
patient in their own institution, and the existing organisation-scoping tests still pass.
`tests/test_api_org_scoping.py` is the place to extend.

**Gate:** this is authentication and data access, so `/security-review` before it ships
(non-negotiable #2, which is explicitly *not* relaxed pre-launch).

---

## Route-wide access-control test

**Priority: high — depends on nothing.** Raised 2026-08-26.

152 API routes exist; 4 have an access-control test. One test should walk every registered route
and call it as each wrong identity — a clinician from another institution, a parent, a teen — and
fail if any route returns data it shouldn't. New routes then get checked automatically instead of
relying on someone remembering.

Needs an explicit allowlist of routes that are *meant* to be public (login, password reset, the
monitoring form a parent opens from a link). That list is worth writing down regardless — it does
not exist anywhere today.

The three rules it should encode, from the owner:
1. A clinician sees only what their institution — and, once the item above ships, their patient
   list — allows.
2. A parent or child never gets clinician-level access within their institution.
3. A parent sees only their own family's data, and a child only their own.

Rules 2 and 3 are already enforced in code (`get_practitioner_context` requires a clinician
profile; `get_parent_context` joins through `parent_patient_links`). They are barely tested.

---

## Product review and backlog generation

**Owner: Peter. Not for Claude to generate.** Raised 2026-08-27.

The open-items list needs to come from Peter reviewing the product. Claude reading the source code
produces only the mechanical half — disabled buttons, TODOs, a table nothing writes to. It cannot
find a screen that works but confuses, a flow with too many steps, or something missing that was
expected. Those came from Peter looking at it all day ("it's a mess", "this is still loading up the
screen"), and nothing in the code would have surfaced them.

Any list Claude produces on its own will be partial and will read as more complete than it is.

## Smaller, already agreed

- **"Plan an experiment" is missing from the flat ladder.** It exists only in the situations view
  (`BehaviorPanel`), so an ungrouped rung cannot be reached. See
  [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md).
- **"Run AI review" has never done anything.** `run_ladder_review` reads `ladder_rungs`, which has
  zero rows in production. Decide what it should read now that rungs are behaviour rows.
- **Session mode still only asks "what do you do so it feels safer?"** — it should also be able to
  add a version-of-this-situation rung. Phase 3 of the flat-ladder plan.
- **`.claude/settings.local.json` has 279 allow entries** — worth pruning to patterns.
