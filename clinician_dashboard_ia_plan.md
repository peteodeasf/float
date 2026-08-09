# Clinician Dashboard — IA Refactor + Cleanups

> **⚠️ SUPERSEDED (2026-08-09).** This v3 direction (phase spine + persistent "Case file") was
> built but judged too complex/workflow-enforcing. The active direction — flat tabs, no phases, no
> case-file framing, process-level checklist — lives in
> [`docs/plans/clinician_portal_redesign_brief.md`](docs/plans/clinician_portal_redesign_brief.md).
> Kept for history and for the still-valid feature map / Sessions data-model notes.

Status: ~~planned, not started~~ **built, now being replaced.** Target structure locked (see `~/Downloads/dashboard-ia.png`, v3).
Scope: reorganize the clinician patient workspace (`apps/web/src/pages/practitioner/PatientPage.tsx`)
around a clearer information architecture, plus two small cleanups that can ship immediately.

## Context / problem
The clinician patient view grew organically and is now confusing: the "patient journey" shows
in **two places** (a fat left-rail "Setup steps 1–4 + Workspace" *and* implied progression), and
the Workspace crams six flat tabs (Treatment Plan · Experiments · Weekly Session · Action Plans ·
Messages · Close) that mix plan-building, doing, and session artifacts. The work actually has a
clean shape the UI doesn't reflect.

## The mental model (locked)
Three phases the case moves through, **non-linear** (you can revisit):
1. **Assess** — parent monitoring + AI analysis (pre-contact).
2. **Consult** — the first sessions where you formulate and **build the plan**. *(Deliberately
   loose — the in-room workflow is TBD with Dr. Walker; don't over-structure it.)*
3. **Treat & track** — the doing: teen experiments, parent accommodations + logs, monitoring,
   messages.

Two things you keep returning to **lift out of the phases** as persistent components:
- **Case file** — the treatment plan (situations · behaviors · ladder · parent accommodations)
  + people (patient · parents). Built in Consult, open from any phase.
- **Sessions** — one appointment timeline spanning Consult → Treat. Consults and weekly reviews
  are the **same object** (date + type); each holds notes · checklist · formulation (early) ·
  action plan.

## Target layout (v3)
- **Phase spine** = a slim status bar **across the top only** (Assess → Consult → Treat; the
  Consult→Treat boundary = *plan activated*). This replaces the fat left-rail journey list.
- **Left rail** = `Case file` + `Sessions` (always available) then the **current phase's working
  areas**. Selecting a phase in the top spine swaps the rail's working set.
- **Main** = the selected surface.

## What moves (today → target)
| Today | Target |
|---|---|
| Left rail: "Setup steps 1–4" | Top spine: steps 1–2 → **Assess**; steps 3–4 → first entries in **Sessions** |
| Tab: Treatment Plan | **Case file** (persistent) — plan + people; parent accommodations stay here |
| Tab: Weekly Session | **Sessions** (persistent) — one appointment in the timeline |
| Tab: Action Plans | **Sessions** — each appointment carries its own action plan |
| Consultation setup steps + checklist + downward arrows | **Sessions** (early appointments) + **Case file** (formulation feeds the plan) |
| Tab: Experiments | **Treat** working area |
| (parent accommodations panel) | **Case file** (part of the plan) — with the invite moved out (see Cleanup #2) |
| Tab: Messages | **Treat** working area (child + parent threads already toggle) |
| Monitoring form / Analyze data | **Assess** working area |

Note: this is mostly **re-homing existing features under a new nav**, not building new features —
lower risk, but concentrated in one large file.

---

## Build order

### Phase 0 — Quick cleanups (independent; can ship first)
Small, already-scoped from review; no dependency on the refactor.
1. **Remove "Recent experiments" from the treatment-plan situation panel** (`PatientPage.tsx`,
   the situation detail) — experiment history lives on the Experiments surface. *(Already staged
   locally, uncommitted.)*
2. **Relocate "Invite a parent"** out of `ParentPlanPanel` and up beside the teen invite
   (`TeenAccessPanel` area) — access/invites belong together.

### Phase 1 — Nav shell (the visible refactor)
Introduce the new chrome and re-home existing content **without changing the features themselves**:
- Replace the left-rail "Setup + Workspace" nav with the **top phase spine** + **slim per-phase
  rail** + persistent **Case file** and **Sessions** entries.
- Map: Treatment Plan → Case file; Experiments/Accommodations/Monitoring/Messages → Treat;
  Monitoring form/Analyze → Assess. Wire `activePersistentTab` (and the setup-step state) to the
  new phase + rail model.
- Files: `PatientPage.tsx` (epicenter — the tab/step state machine + layout), plus the small nav
  components. Keep each tab's existing content component intact; just re-parent it.

### Phase 2 — Sessions unification (the harder piece)
Merge **Weekly Session + Action Plans + consultation steps** into one **Sessions** timeline where a
"session" = an appointment (date + type) that groups its notes · checklist · formulation · action
plan.
- **Design/data:** today `session_notes`, `action_plans`, `consultation_checklists` are separate
  and mostly per-patient, not per-appointment. Unifying likely needs a light **`session` grouping**
  (id · patient · date · type) those artifacts attach to — a small model + migration — *or* a
  virtual grouping by date. Decide during design.
- **Gated on Dr. Walker** defining how sessions are actually run (esp. the Consult ones), so we
  don't build the wrong structure.

### Phase 3 — Consult content + polish
Flesh out the Consult phase's working surfaces once the session workflow is defined; tidy per-phase
surfaces and empty states.

---

## Not in scope / deferred
- No change to the teen or parent apps, or to any clinical data the surfaces show.
- Reminders/scheduler, and the parent-experience deferred layers, are unrelated.

## Risks
- `PatientPage.tsx` is ~4,200 lines and holds the tab/step state machine — Phase 1 is invasive
  even though it's "just" re-homing. Consider extracting the nav shell as its own component.
- Phase 2's session model is the one place real data-modeling is needed; keep it behind the
  Dr. Walker workflow decision.

## Verification
- Phase 0: the plan tab no longer shows per-situation experiment history; parent invite appears
  beside the teen invite and still creates the parent account.
- Phase 1: every existing feature is reachable under the new nav; nothing lost; `vite build` clean.
- Phase 2: an appointment shows its notes/checklist/action-plan together; consults and weekly
  reviews render in one timeline.
