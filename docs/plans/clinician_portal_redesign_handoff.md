# Clinician Portal Redesign — Design Handoff to Claude Code

Comp: `Clinician Portal Redesign.dc.html` (interactive; toggle §3 option A/B in the top bar).
Supersedes the phase-spine IA. Brief: `docs/plans/clinician_portal_redesign_brief.md`.

---

## 1. Decisions made

| Question | Decision |
|---|---|
| Phases (Assess/Consult/Treat) | **Deleted.** Retire `activePhase`, `activeStep`, `activePersistentTab`. |
| Left rail | **Deleted.** Flat tabs only, no rail-swapping. |
| "Case file" label | **Deleted** as a concept. |
| §3 plan home | **Comped both.** A = 5th "Plan" tab; B = plan lives in Patient record opened from header. Awaiting Dr. Walker. Build the tab shell so the plan surface is a route either way. |
| Sessions | **Flat list of session notes.** No per-appointment grouping, no session data-model work now. |
| Action plans | **Not at session level.** Removed from the session detail; stays a separate per-patient surface (leave where it is for now). |
| Checklist + tips | One **process-level right panel**, available on every tab, collapsible groups. |
| Close case | **Out of scope** — not built, not needed for now. |
| Diagnosis/presentation tags in header | **Removed.** |

## 2. Tab order (final)

`Monitoring · Sessions · Plan* · Experiments · Chat`
\* Plan tab only under option A. Under option B those four tabs remain and the plan lives in the record page.

Tabs sit **under the existing `PractitionerNav` subHeader**. Active tab = bold slate text + 3px teal bottom border. Badges are neutral slate pills (`2 new`, `14`, `3 active`, `17`).

## 3. Patient header

One row: avatar · name · status chip · plan/week line; second line = `Age · Gender · Anxiety nickname`.
Right side: **Teen access** and **Parent access** as bordered status cards (dot + state + one action) — replaces the faint top-right text links. Then two buttons: `Open patient record` (option B) / `Edit profile` (option A), and `Process` with the checklist count badge.

## 4. Per-tab specs

**Monitoring** — restructured around **rounds**, not a single form. Round cards (Baseline / Mid-treatment / Post-treatment refresh) + `+ New round`; selecting one shows its own send → submit → extract → report state line, then AI extraction (editable rows, per-field confidence) and preliminary report. Requires a `monitoring_round` concept (id · patient · type · scheduled/sent/submitted/analyzed). Later rounds should support a comparison report against baseline — placement only, don't build yet.

**Sessions** — 320px list (filter chips: All / Consults / Weekly / Action plans) + detail pane: note editor with auto-save indicator, `Publish summary`, and the downward-arrow chain. `renderNotesSection`, `AutoSaveSessionNote`, `ConsultationChecklist`, `SessionDownwardArrow` re-parent here; the per-step checklist rendering is **removed** (it moves to the process panel).

**Plan / Record** — situations list → behaviours table (kind tag + DT rating + `+ Plan experiment`) → fear ladder with score bars; then Parent accommodations (ranked, one FOCUS) with recent parent logs. Header actions: `Run AI review`, `Re-activate plan`. Option B adds a profile field grid on top and a back link.

**Experiments** — Current focus block + Needs attention list (overdue / low confidence, `Remind`), all-experiments list, Progress card. **Reuse the existing Belief-in-Prediction and Fear-Level charts unchanged** — the comp's bars are placement only.

**Chat** — thread list (teen / parent) + messages. Scope chip on the header makes role separation visible. No cross-role views.

## 5. Process panel

Right-hand sticky panel, toggled from the header, persists across tabs. Two tabs: **Checklist** (collapsible meeting groups; default open = the in-progress group) and **Tips** (`SESSION_PREP_CONTENT` consolidated here). `StepGuideCard` / `SessionPrepCard` / per-surface "Show step guide →" links are all removed.

Badge = completed / total checklist items. **Open:** decide whether recurring weekly items count in the denominator — recommendation is badge counts setup groups only, weekly shows its own per-week count inside the panel.

## 6. Patient list

Columns: Patient (avatar · name · age/guardian) · Stage · **Needs attention** · Last activity. Stage replaces "Setup · Step 1 of 4" (phase language dies with the spine) — use `SETUP` / `IN TREATMENT · WK n` / `REFRESH DUE`. Needs-attention shows the real reason ("Monitoring form outstanding · 11 days") with an amber dot; sort attention-first. Filter chips + search above the table.

## 7. Implementation order

1. Extract the tab shell as its own component; delete the phase/step state machine in `PatientPage.tsx`.
2. Re-parent existing content components under the new tabs — **no feature rewrites**.
3. Move checklist + tips into the process panel; delete per-step instances.
4. Header/access rework.
5. Monitoring rounds (only real new data: `monitoring_round`).
6. Patient list.

Verify every §2 inventory item is still reachable; `vite build` clean; `/security-review` on anything touching role scoping.

## 8. Deliberately not designed

Close case · session-level action plans · per-appointment session grouping · comparison reporting between monitoring rounds · chart redesign.
