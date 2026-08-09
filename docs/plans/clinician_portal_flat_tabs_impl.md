# Clinician Portal — Flat Tabs Implementation Plan (Option 1)

Branch: `clinician-portal-flat-tabs`. Scope: **Option 1** — the safe refactor. Ships the whole IA
simplification with **no migration and no clinical gate**. Monitoring rounds and the patient-list
rework are **deferred** (see "Deferred").

Sources: [`clinician_portal_redesign_handoff.md`](clinician_portal_redesign_handoff.md) (Design),
[`clinician_portal_redesign_brief.md`](clinician_portal_redesign_brief.md) (inventory).
Epicenter: `apps/web/src/pages/practitioner/PatientPage.tsx` (~4,200 lines).

## Approach: surgical re-parenting, not a rewrite

The content builders are already `const`s in the component body — `monitoringCard`,
`monitoringExtractContent`, `preliminaryReportContent`, `treatmentPlanBuilder`, `experimentsContent`,
`accommodationContent`, `actionPlansContent`, `messagesContent`, `preSessionBriefContent`,
`patientDAContent`, plus the render helpers `renderGuide`/`renderPrep`/`renderNotesSection`. **Keep
those builders; change only the scaffolding that selects and wraps them.** This keeps every feature
byte-identical internally (lowest risk given prod is close) and concentrates the churn in the
nav/layout + state.

### State machine: before → after
- **Delete:** `activePhase`, `activeStep`, `activePersistentTab`, `selectPhase`, and the phase→rail
  derivation (`PatientPage.tsx` render block ~3914–4052).
- **Add:** `activeTab: 'monitoring' | 'sessions' | 'plan' | 'experiments' | 'chat'`;
  `sessionsFilter: 'all' | 'consults' | 'weekly' | 'action_plans'`;
  `processPanelOpen: boolean`. Keep `PersistentTabId`/`SessionPrepType` types only where still used.
- **Plan home (A/B) — build A now, factored for B:** render the Plan surface as a self-contained
  block (`planSurface`) shown under the `plan` tab (option A, the default). Keep it a single unit so
  option B later = mount `planSurface` on a `/record` route and drop the tab — no internal change.
  A vs B stays **Dr. Walker's** call; this pass does not force it.

## Tab mapping (what each new tab renders)

| Tab | Renders (existing builders) | Notes |
|---|---|---|
| **Monitoring** | `monitoringCard` + `monitoringExtractContent` + `preliminaryReportContent` + `InlineMonitoringReport` + extraction modal | merge today's step 0 + step 1 into one surface. Single-form flow **unchanged** (no rounds). Drop `renderGuide(1/2)`. |
| **Sessions** | filter chips → `renderNotesSection('consultation_1'/'consultation_2'/'weekly_session')`, `AutoSaveSessionNote`, `patientDAContent`, `preSessionBriefContent`; **Action plans** chip → `actionPlansContent` | list+detail shape via the filter chips (no new session data model). Per-step **checklists removed** from here (→ process panel). |
| **Plan** | `treatmentPlanBuilder` + `ParentPlanPanel` (accommodations) | option A tab. Header actions Run AI review / Re-activate plan already inside builder. Drop `renderGuide(5)`. |
| **Experiments** | `experimentsContent` | drop `renderPrep('session_3')` (→ process panel). Existing charts unchanged. |
| **Chat** | `messagesContent` | add a role-scope chip; keep teen/parent thread toggle. No cross-role view. |

**Reconciliations (my defaults, documented so they're easy to flip):**
- *Action plans* (handoff §1 vs §4 conflict): make it a **filter within Sessions** (§4's version) —
  reachable, not at individual-session level, no separate top-level tab. Resolves the conflict.
- *Presentation/anxiety tags*: removed from header per handoff; still editable via Edit profile
  (option A). No data lost.
- *Process badge denominator*: count **setup checklist groups only**; weekly shows its own per-week
  count inside the panel (Design's recommendation).

## Process panel (new component)

`ProcessPanel` — right-hand sticky panel, toggled by a `Process` button in the header, persists
across tabs. Two internal tabs:
- **Checklist** — `PARENT_CHECKLIST` + `PATIENT_CHECKLIST` as collapsible groups (reuse
  `ConsultationChecklist` group rendering); default-open = first incomplete group.
- **Tips** — `SESSION_PREP_CONTENT` + the `StepGuideCard` copy, consolidated.

Delete per-surface instances: `StepGuideCard`, `SessionPrepCard`, `renderGuide`, `renderPrep`, and
all "Show step guide →" links. Badge = completed/total of the setup groups.

## Header rework

Restructure the area under `PractitionerNav` (the subHeader `title`/`subtitle`/`rightAction` at
`PatientPage.tsx` ~3763–3798):
- Identity row: name · status chip · plan/week line; second line `Age · Gender · Anxiety nickname`.
- **Teen access** and **Parent access** as bordered status cards (dot + state + one action).
  Parent access surfaces the invite currently buried in `ParentPlanPanel` → **security-sensitive**
  (access control moving to a new surface).
- Buttons: `Edit profile` (option A) and `Process` (with checklist badge).

## Build order (matches handoff §7, minus deferred)

1. **Shell + state** — replace phase spine + rail + the two content branches with the flat tab bar
   + `activeTab` switch; delete the phase/step state machine. Wire existing builders into tabs.
   **✅ Done.**
2. **Sessions filter** — chips + `sessionsFilter`; route note sections + action plans through it.
   **✅ Done** (consults keep `AutoSaveSessionNote` + downward arrows; weekly keeps notes + brief +
   accommodations; action plans is a filter).
3. **Process panel** — checklist (two `ConsultationChecklist`) + tips (`SESSION_PREP_CONTENT`),
   toggled from a header Process button with a completed/total badge; per-step instances deleted.
   **✅ Done.**
4. **Header/access** — identity + Teen/Parent access cards. **⏳ Partial** — Process button added;
   full identity/access-card rework still to do. Surfaces the parent invite → **run `/security-review`.**
5. *(deferred)* Monitoring rounds — needs `monitoring_round` model + migration + Dr. Walker.
6. *(deferred)* Patient list rework.

### Progress checkpoint (2026-08-09)
Steps 1–3 landed on branch `clinician-portal-flat-tabs`. `vite build` (Netlify deploy path) **clean**.
`tsc -b` has 7 **pre-existing** unused-symbol errors (1→1 vs the original; two in files this change
never touched) — flagged for separate cleanup, not fixed here to keep the diff focused. Not committed.
Next: step 4 (header/access) behind `/security-review`, then manual pass on the demo patient.

## Verification / gates

- `vite build` (i.e. `tsc -b && vite build`) clean after each step.
- **Every inventory item (brief §2) still reachable** under the new tabs — walk the list.
- Manual pass on the "Peter Parker" demo patient across all five tabs + process panel.
- **`/security-review`** on step 4 (Teen + Parent access now in the header) and the Chat scope chip —
  anything touching role scoping (non-negotiable #2).
- Work stays on-branch; no push/merge without review. Migrations: none in this scope.

## Deferred (explicitly out of this pass)

Monitoring rounds (`monitoring_round` + migration + protocol decision) · patient-list rework ·
session-level action plans · per-appointment session grouping · monitoring-round comparison
reporting · Close case · chart redesign · option B record page (build A, keep factored for B).
