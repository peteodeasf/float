# Float — Parent & Accommodation Foundation: Design & Build Plan

Status: **spine built (not deployed).** Steps 1–2 implemented against the settled
decisions; migration `b8c4d1e9f207` is a file only, not yet applied to prod. The feature
layers (chat, reminders, child-rates-accommodations, milestone rewards, JIT education)
depend on the spine and get their own docs.

Scope of this doc: the **spine** only — parent auth foundation + the accommodation entity.

Grounded against the live codebase and production DB (2026-07-23). Where this doc
contradicts the original plan, the contradiction is called out — the plan made two
assumptions the code doesn't support.

---

## 0. What actually exists today (verified)

| Area | Reality | Source |
|---|---|---|
| Parent accounts | **None.** Parents are 3 text fields (`parent_name/email/phone`) on `patient_profiles`. No user, no login. | `patient.py:50-52` |
| `"parent"` role | Does not exist. Prod `user_roles`: 1 admin / 25 patient / 3 practitioner. | verified in prod |
| `parent_patient_links` table | **Exists, 0 rows, never used in code.** Cols: `id, parent_user_id→users, patient_id→patient_profiles, organization_id, created_at, phone_number`. Shape already supports N parents per case. No unique constraint. | `patient.py:66-87`, prod |
| `accommodation_behaviors` table | **Exists, 0 rows, never used in code.** Has a distress field but **no situation link and no ordering**. `parent_user_id` is **NOT NULL**. | `experiment.py:74-103`, prod |
| `fear_rating_max` | **Not a column anywhere.** Exists only as a JSON key in the LLM extraction prompt. No range/min-max storage on any table. | `patients.py:504-575` |
| Message model | Generic `sender_user_id` / `recipient_user_id`; only `patient_id` is required. Carries parent↔therapist as-is. | `message.py:16-37` |
| Reminders | **No scheduler exists.** Fire only via manual admin POST; teen-SMS only. | `experiment_reminder_service.py`, `progress.py:46` |
| Rewards / milestones | **No model.** Completion events (commit/complete/mastered/situation-worked) are all tracked and recomputed on read. | `progress_service.py`, `teenProgress.ts` |

Two orphaned FKs — `parent_patient_links` and `accommodation_behaviors.parent_user_id`
— show this whole direction was scaffolded once and abandoned. We're finishing it, not
starting it.

---

## 1. Corrections to the original plan

1. **`fear_rating_max` does not exist.** The plan assumed accommodation distress ranges
   (2–4, 5–9) ride on an existing field. They don't. Per the decision taken, we add
   **min/max range storage** as net-new schema (§3.2).

2. **Reminders are not "wiring."** There is no cron/scheduler at all. Parent exposure
   reminders require a real scheduled runner plus a parent notification channel. This is
   the largest hidden-foundation item and is **out of scope for the spine** — flagged so
   it isn't underestimated when its own doc comes.

3. **`accommodation_behaviors.parent_user_id` is NOT NULL**, which blocks the therapist
   from entering accommodations before a parent has an account. The plan wants
   therapist-first entry from monitoring/consultation. The migration must make this
   nullable (§3.2).

---

## 2. Structural decisions (locking in the plan's own calls)

- **Accommodation behaviors are a distinct entity from avoidance/safety behaviors — do
  not conflate.** Avoidance/safety behaviors are the **child's** actions (already built:
  `AvoidanceBehavior`, the per-situation exposure ladder, teen experiments). Accommodation
  behaviors are the **parent's** actions (`accommodation_behaviors`, new). They share a
  structural *pattern* (situation → behavior → experiment) but are separate entities,
  separate ladders, and separate actors. Anywhere this doc reuses child-side code idioms
  (e.g. the `rung_order` ordering pattern in §3.2), it borrows the **mechanism only**.
- **The parent object is the accommodation.** Situation → parent accommodation →
  experiment to reduce it. The replacement response is a *tip on the experiment*, not an
  entity.
- **The two distress ratings measure different triggers.** Avoidance behavior =
  child's distress *when the child refrains*. Accommodation = child's distress *when the
  parent stops accommodating*. Same rater (the child), different action. (This is a third
  reason to drop `distress_thermometer_when_refraining` from the accommodation table —
  §3.2 — its name carries the wrong, child-refrains semantics.)
- **The parent ladder is per-child, flat** — one distress-ordered list per child, with
  situation as optional metadata. It does **not** nest inside situations the way the teen
  ladder does. This is why the parent experience is not a reskin of the teen flow: same
  brand tokens and primitives, different navigation model.
- **Ownership is per-child via the treatment plan.** `accommodation_behaviors.treatment_plan_id`
  → plan → patient already gives us "per child" without a new column.
- **Two parents per case** is supported by `parent_patient_links`' shape today; we cap and
  enforce in app logic, not schema.

---

## 3. Data model changes

### 3.1 Parent accounts & two-parent support

No new table — `parent_patient_links` already exists. Changes:

- **Role:** introduce `"parent"` as a `UserRole.role` value. `UserRole.role` is free-text,
  so this is **not** a schema change — just a new value the code writes and checks.
- **Link table hardening (migration):**
  - Add a **unique constraint on `(parent_user_id, patient_id)`** so a parent can't be
    double-linked to the same child.
  - Add indexes on `patient_id` and `parent_user_id` for the lookups /auth/me and the
    therapist panel will do.
- **Relationship semantics (app logic, no schema) — SETTLED:**
  - **A patient may have any number of parents — no cap.** The table allows N and not
    capping is strictly less code (no invite-time enforcement). UI copy says "parents,"
    never "both parents."
  - **MVP model is single-child → multiple-parents.** A parent account maps to **one
    child**. The one-parent-multiple-children (sibling) case is deferred — `/auth/me` may
    return >1 child structurally, but no child-switcher is built yet.
  - All parents linked to a patient see the same accommodations/experiments (shared
    visibility, via `patient_id`). "Handoff when one parent is depleted" is a feature-layer
    concern, not spine.

### 3.2 Accommodation entity

`accommodation_behaviors` is empty in prod, so we reshape it freely — no backfill.

Migration on `accommodation_behaviors`:

| Change | Column | Type | Why |
|---|---|---|---|
| **Add** | `trigger_situation_id` | UUID FK → `trigger_situations.id`, **nullable** | Optional situation link. Mirrors `DownwardArrow`'s situation-agnostic pattern (`downward_arrow.py:25-33`). |
| **Add** | `display_order` | Integer | Per-child ladder position; therapist-reorderable. Mirrors `rung_order`/`display_order` idiom. |
| **Add** | `distress_min` | Numeric(3,1), nullable | Low end of the distress-if-stopped range. |
| **Add** | `distress_max` | Numeric(3,1), nullable | High end. A single value is just `min == max`. |
| **Alter** | `parent_user_id` | drop NOT NULL → **nullable** | Therapist enters accommodations before a parent account exists; parent gets linked later. |
| **Drop** | `distress_thermometer_when_refraining` | (removed) | Redundant — see below. Safe to drop; table is empty in prod. |

**One rating, the child's.** The distress-if-stopped rating belongs to the *child*
(their anticipated distress if the parent stops the accommodation). It has two entry
paths to the **same** `distress_min`/`distress_max` field — the therapist panel (captured
from monitoring/consultation) or the child rating in-app — not two separate raters. This
is why the old single field is dropped rather than repurposed: there is no distinct
"therapist estimate."

**Ladder ordering rule — SETTLED.** `display_order` is the source of truth for ladder
position (therapist- and child-reorderable), **seeded** from distress ascending
(easiest-to-stop first). You can't `ORDER BY` a range, so `display_order` — not the rating
— is the live sort key; the rating just seeds it and displays on the row. Mirrors the
exposure ladder (`rung_order` authoritative, seeded from distress) — mechanism only.

Seed key = **midpoint** `(distress_min + distress_max) / 2`. This subsumes the
single-value case with no branch: when `min == max`, the midpoint is that value. Mechanics:
- The midpoint is the sort key used to assign initial `display_order` integers (1..N); it
  is **not stored** — only `min`/`max` are, and the average is computed at seed time.
  Fractional midpoints are fine as a sort key (no rounding).
- **Ties** break by `distress_max` ascending, then insertion order (stable).
- **Unrated** accommodations (no `min`/`max` yet) sort to the bottom until rated.

### 3.3 One migration, production-safe

A single Alembic migration chained after `f3a91c05e8d2` (current prod head):
- accommodation columns + `parent_user_id` nullability (§3.2)
- `parent_patient_links` unique constraint + indexes (§3.1)

No backfill — both tables are empty in prod (verified). Runs through the same Railway
`alembic upgrade head` pre-deploy path used for the teen work.

---

## 4. Auth flow (mirror teen, close the two gaps)

The teen flow is the template: practitioner-guarded invite → `User` + `UserRole` +
temp password + `must_change_password` → dedicated token/client/context/guard → dedicated
`/parent/*` pages, reusing shared `/auth/login`, `/auth/me`, `/auth/set-password`.

**Backend:**
- `POST /patients/{id}/invite-parent` (practitioner-guarded) — create `User` +
  `UserRole("parent")` + `parent_patient_links` row + temp password + email to
  `/parent/login`. Idempotent per email; rejects a 3rd parent on a case.
- **`/auth/me` — real change.** Today it resolves a single `PatientProfile` by `user_id`
  and has no parent branch (`auth.py:106-123`). Add: if the user has a `"parent"` role,
  resolve their `parent_patient_links` → return `role: "parent"` + the linked child(ren).
  A parent with 2 kids returns 2 patient ids.
- **`forgot-password`** — add a parent redirect branch (`/parent/reset-password`),
  alongside the existing patient/other split (`auth.py:173-178`).

**Frontend (mirror teen exactly):**
- `parentApiClient` (token key `parent_access_token`), `ParentAuthContext`,
  `ParentProtectedRoute`, `/parent/*` route group, `ParentLoginPage` / `SetPassword` /
  `Reset`.
- **Multi-child switcher:** deferred (MVP is single-child → multiple-parents per §3.1). A
  parent views one child's ladder; the sibling case comes later.
- **Invite — SETTLED:** same practitioner mechanism as the teen invite, differing only in
  user type (`role: "parent"`) and the link-table row it writes.

---

## 5. What the spine unblocks (later docs, not now)

| Feature | Dependency | Effort shape |
|---|---|---|
| Parent↔therapist chat | Parent accounts (§4) | Near-free — `Message` already carries it; add parent endpoints |
| Child-rates-accommodations | `distress_min/max` (§3.2) | UI + write path; feeds ladder ordering |
| Weekly consistency check-in | Accommodation experiments | New lightweight model; `too_hard` is the template |
| Parent exposure reminders | Parent accounts **+ a scheduler that doesn't exist** | Largest — needs a real runner + parent notification channel |
| Milestone rewards | Existing completion events | New persistence; define rung/situation "completed" rules |
| JIT education | — | Net-new content model |

---

## 6. Open decisions before build

1. ~~Parents per case~~ — **SETTLED: no cap** (§3.1).
2. ~~Distress model~~ — **SETTLED** (§3.2): one rating (the child's) as `distress_min`/
   `distress_max`; drop the old single field; `display_order` authoritative, seeded from
   the **midpoint** of the range (subsumes the single-value case).
3. ~~Multi-child parent~~ — **SETTLED: single-child → multiple-parents MVP**, sibling
   switcher deferred (§3.1, §4).
4. ~~Invite trigger~~ — **SETTLED: same mechanism as teen invite, different user type** (§4).

---

## 7. Build order (spine, then features — matches the original sequence)

1. ~~**Parent auth foundation**~~ — **BUILT**: `"parent"` role, `parent_patient_links`
   wiring + `get_parent_context`, `invite-parent` endpoint, `/auth/me` + forgot-password
   parent branches, `parentApiClient` / `ParentAuthContext` / `ParentProtectedRoute` /
   `/parent/*` pages (login, set-password, reset, home placeholder).
2. ~~**Accommodation entity**~~ — **BUILT**: migration `b8c4d1e9f207` (§3), model reshape,
   schema/service/router, per-child ladder ordering with midpoint reseed.
3. ~~Therapist parent-plan panel~~ — **BUILT**: `ParentPlanPanel` component +
   `api/accommodations.ts`, mounted in the treatment-plan builder (step 4) alongside the
   situations/behaviors editor. Add/edit/delete, optional situation link, distress range
   (min/max), manual reorder, and "sort by distress" (reseed).
4. Parent accommodation experiments + tips. ← **next**
4. Parent accommodation experiments + tips.
5. Child-rates-accommodations (needs `distress_min/max`).
6. Weekly consistency check-in + parent exposure reminders (needs the scheduler).
7. Parent↔therapist chat.
8. Milestone rewards.
9. JIT education (incremental once the content model exists).

Steps 1–2 are the spine this doc covers. Nothing below step 2 should start until the
spine is agreed and the §6 decisions are made.
