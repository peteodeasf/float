# Clinician Portal Redesign — Feature Inventory + Design Brief

Status: **active.** This supersedes the phase-spine direction in
[`clinician_dashboard_ia_plan.md`](../../clinician_dashboard_ia_plan.md) (v3), which is now stale.
Purpose: the handoff package for **Claude Design** to produce layout comps, plus the map Claude
Code uses to re-home features afterward.

Epicenter file: `apps/web/src/pages/practitioner/PatientPage.tsx` (~4,200 lines — the whole clinician
patient workspace, including its nav state machine).

---

## 1. Why we're redesigning

The current workspace enforces a workflow it shouldn't. It has, all at once:
- A **top phase spine** — Assess → Consult → Treat & track — that implies a linear order.
- A **left rail** that swaps its working set based on the selected phase, *plus* two persistent
  entries ("Case file", "Sessions").
- **Per-step checklists and tip/prep cards** (`ConsultationChecklist`, `StepGuideCard`,
  `SessionPrepCard`) scattered across individual surfaces.

Net effect: the clinician is told *what order to work in* and *which phase owns which feature*, when
at this stage the tool should just **expose the available features clearly and let the clinician
choose**.

### Target direction (decided)
- **Drop phases** (Assess/Consult/Treat) entirely.
- **Drop the "Case file" framing** as an organizing concept.
- **One flat set of tabs**, no rail-swapping, no enforced order:
  1. **Monitoring** — monitoring form + AI analysis
  2. **Sessions** — all session notes (consults, weekly reviews, action plans)
  3. **Experiments** — setting up and tracking behavioural experiments
  4. **Chat** — messages (teen + parent threads)
- **Checklist & tips are process-level, not per-step** — one overall process checklist and one
  tips surface for the clinician, available regardless of tab, not embedded in individual steps.
- **Fix the patient name / profile / access** header — currently cramped and unclear.

---

## 2. Feature inventory — everything that must stay reachable

Extracted from `PatientPage.tsx`. Each item is an existing feature; the redesign **re-homes**, it
does not remove. Grouped by proposed new tab.

### → Monitoring
| Feature | Current location | Notes |
|---|---|---|
| Send / resend monitoring form to parent | Assess · "Monitoring" (step 0) | `getMonitoringForm` / `sendMonitoringForm`; status: not sent / in progress / submitted |
| Monitoring status indicator | header `activitySummary` + Assess | |
| AI extraction of monitoring data | Assess · "Analyze" (step 1) | `extractMonitoringData` → editable `MonitoringExtraction` |
| Preliminary AI report | Assess · "Analyze" | `generatePreliminaryReport` / `getMonitoringReport`; `InlineMonitoringReport` |
| "New monitoring to analyze" signal | `has_new_monitoring_entries` | drives the "re-analyze" affordance |

### → Sessions (the big consolidation)
| Feature | Current location | Notes |
|---|---|---|
| Parent consultation notes + checklist | Consult · "Parent consult" (step 2) | `ConsultationChecklist` (Step 3), `SessionPrepCard` session_1 |
| Patient consultation notes + checklist | Consult · "Patient consult" (step 3) | `ConsultationChecklist` (Step 4), `SessionPrepCard` session_2, nickname agreement |
| Downward-arrow / formulation | Consult surfaces | `PatientDownwardArrows`, `SessionDownwardArrow` — feared-outcome laddering |
| Weekly review notes | Sessions · "Weekly review" | `renderNotesSection('weekly_session')`, `SessionPrepCard` weekly, pre-session brief |
| Action plans | Sessions · "Action plans" | `actionPlansContent` — create action plan, notes editor, next-appointment; `draftPlanCount` badge |
| Auto-saving session notes | throughout | `AutoSaveSessionNote` (per `session_type`) |
| Session prep / tips cards | all session surfaces | `SESSION_PREP_CONTENT` (session_1/2/3/weekly) → **becomes process-level tips** |
| Consultation checklists | steps 3 & 4 | **becomes the single process checklist** |

> Data note (unchanged from v3): `session_notes`, `action_plans`, `consultation_checklists` are
> today separate and mostly per-patient, not per-appointment. A true unified "Sessions timeline"
> (one appointment groups its notes · checklist · action plan) likely needs a light `session`
> grouping (id · patient · date · type) or a virtual grouping by date. **This is the one place real
> data-modeling is needed, and it's gated on Dr. Walker defining how sessions are run.** The
> redesign can ship a simpler "list of session notes" first and unify later.

### → Experiments
| Feature | Current location | Notes |
|---|---|---|
| Experiment list / timeline | Treat · "Experiments" | `experimentsContent`; `getPatientExperiments`; overdue + low-confidence flags, focus/upcoming |
| Plan an experiment for a behaviour | Behavior panels | `planExperimentForBehavior`; confidence, plan text, date (`getNextSchoolDayISO`) |
| Progress charts | Experiments · Progress section | query enabled only on this tab |
| Session prep for experiments | Treat · "Experiments" | `SessionPrepCard` session_3 |

### → Chat (Messages)
| Feature | Current location | Notes |
|---|---|---|
| Teen ⇄ clinician thread | Treat · "Messages" | `messagesContent`, thread toggle `teen`/`parent` |
| Parent ⇄ clinician thread | Treat · "Messages" | same surface |
| Unread badge | rail | `unreadMessageCount` |

### → Needs a home — see §3 (the open question)
| Feature | Current location | Notes |
|---|---|---|
| **Treatment plan builder** | "Case file" (`treatmentPlanBuilder`) | situations/triggers · behaviors · fear ladder · DT ratings · **anxiety nickname** — the clinical backbone |
| **Parent accommodations** | "Case file" (`ParentPlanPanel` / `accommodationContent`) | accommodation plan the parent works |
| **Plan activation** | plan status | activate/commit the plan (feeds teen + parent apps) |
| Patient profile | header · "Edit profile" | name, age, gender, phone, anxiety presentations |
| Teen access / invite | header · "Teen access" | `TeenAccessPanel` |
| Parent invite | inside `ParentPlanPanel` | v3 wanted this moved beside the teen invite |
| Close case | rail · bottom | `close` tab — currently a placeholder |

---

## 2A. Current-state surfaces — annotated (screenshots captured 2026-08-09)

Ten full-window screenshots of the current v3 workspace were captured on the **"Peter Parker" demo
patient** (test data — Spider-Man themed: nickname "The Goblin", situations "Fighting crime in
Central Park" / "Going to Brooklyn", behaviors "stay in midtown"/"using my web shooters"). Attach
these images to the Claude Design handoff alongside this brief. What each reveals:

**The chrome being removed**
- **Phase spine** (Assess `1` → Consult `2` → Treat & track `3`) sits across the top of every
  surface; selecting a phase swaps the rail's working set. This is the enforced-workflow structure to
  delete.
- **Left rail** has: an "ALWAYS AVAILABLE → Case file" entry, a "SESSIONS → Weekly review / Action
  plans" group, then a section **captioned with the current phase name** ("ASSESS" → Monitoring,
  Analyze / "CONSULT" → Parent consult, Patient consult / "TREAT & TRACK" → Experiments, Messages),
  and "Close case" pinned at the bottom. Note the rail's phase-caption is **redundant** with the top
  spine — collapsing to flat tabs removes both at once.

**Pain points visible in the shots**
- **Header is thin.** Name · "Age 13 · Male · Active treatment" as small grey text, with **"Teen
  access" and "Edit profile" as faint top-right text links.** No real patient record — reinforces
  §3 option B.
- **Tips are per-surface.** A "Show step guide →" link appears on Monitoring, Analyze, Weekly review,
  Case file, Experiments. → consolidate into one process-level tips surface.
- **Checklists are per-step.** Patient consult shows **CHECKLIST 0/16** ("Meeting 1 — Discovery &
  Education", "Meeting 2 …"); Parent consult shows **CHECKLIST 0/12**. These are exactly the
  "individual parts" checklists to replace with **one overall process checklist** — and they're
  already meeting-structured, which is good raw material for it.
- **"NEXT →" nudge banner** tops the consult surfaces ("Ask what the child wants help with…") —
  another workflow-enforcing element.
- **Accommodations appear twice** — the full ladder + parent logs live in Case file, and a "Parent
  Accommodation Check-ins → Mark check-in complete" card also sits on Weekly review. Consolidation
  opportunity.

**Surface → target-tab, with density notes**
| Screenshot | Current surface | Target | Density / notes |
|---|---|---|---|
| Parent monitoring form | Assess · Monitoring | **Monitoring** | light — just "Send monitoring form" |
| Analyze Monitoring Data | Assess · Analyze | **Monitoring** | empty-state ("send a form first") |
| Case file | Always available | **§3 home** | dense: situations list + behavior detail (tags, DT badges, "Run AI review", "+ Plan experiment") |
| Parent accommodations | Case file (lower) | **§3 home** | dense: add-form + ranked ladder ("Set focus"/Edit/Delete) + "Recent parent logs" (Gave in/Held) |
| Experiments | Treat · Experiments | **Experiments** | dense: Current focus, "Needs attention" overdue list w/ "Remind teen", Belief-in-Prediction + Fear-Level charts |
| Parent consult | Consult | **Sessions** | session notes + CHECKLIST 0/12 |
| Patient consult | Consult | **Sessions** | session notes + Downward Arrows + CHECKLIST 0/16 |
| Weekly review | Sessions | **Sessions** | pre-session brief + session notes + accommodation check-in |
| Action plans | Sessions | **Sessions** | empty-state ("summaries written to the patient, published to their app") |
| Close case | rail bottom | (its own / profile) | placeholder only |

**Not yet captured** (optional, low priority): the **Messages/Chat** thread view (the rail shows a
`Messages 17` badge but the thread UI wasn't shot), and the **expanded "Edit profile" / "Teen access"**
panels. Chat is conceptually simple (teen + parent threads); grab these only if convenient.

---

## 3. The one decision the 4-tab list doesn't answer (flag for Design + clinical)

The four tabs cleanly absorb Monitoring, Sessions, Experiments, and Chat. But the **treatment plan
itself** — situations, behaviors, fear ladder, DT ratings, nickname, plan activation — plus **parent
accommodations** and **people/access (profile, teen & parent invites)** do **not** belong to any of
the four. This is the same content the old design called "Case file"; dropping the *label* doesn't
remove the *need for a home*.

Options for Design to mock (pick with Dr. Walker):
- **A — 5th tab "Plan":** the plan + accommodations get their own flat tab. Simplest and honest;
  five flat tabs is still far simpler than phases + rail. Experiments and Sessions reference it.
- **B — Patient record:** the plan + accommodations + access live in an expanded **patient
  profile/record** area (which the header opens), treating them as "who this patient is and their
  plan," not a workflow step. Directly addresses the "profile/access is poorly laid out" complaint.
- **C — Fold into Experiments:** behaviors → experiments are tightly coupled, so the ladder/behaviors
  live with Experiments; accommodations + access move to the profile/record. Fewest tabs.

Recommendation to explore first: **B or A.** The plan is a persistent artifact the clinician returns
to, and merging "profile + access + plan" into one well-designed patient record solves the header
complaint at the same time. Have Design comp A and B side by side.

Also decide: where do the **process checklist** and **tips** live so they're available across tabs
(e.g. a collapsible right-hand panel, or a "Process" affordance in the header) rather than embedded
per-step.

---

## 4. Constraints & brand (so comps are implementable)

- **Data-dense clinical tool for clinicians. Desktop-first.** Not a marketing page — favour
  legibility and scannability over hero moments.
- **Brand palette:** primary `#135450`, accent `#9af6e4`, deep `#0d3d3a`; teal used for active nav,
  chips, primary buttons. Neutrals: slate (`#f1f5f9` app bg, `#e2e8f0` borders, `#475569`/`#94a3b8`
  text). Font: **Arial** (app standard).
- **Existing chrome:** `PractitionerNav` provides the top bar + a `subHeader` (back link, title,
  subtitle, right actions). The redesign lives **below** that bar; keep using it. UI primitives live
  in `apps/web/src/components/ui`.
- **Hard role boundaries (non-negotiable, HIPAA):** parent, child, and clinician data are separated.
  A redesign must never surface a child's private log to a parent, or clinician-only data to a
  child. Any change here requires `/security-review`. Comps must not invent cross-role data views.
- **Clinical sign-off:** what counts as avoidance/safety/escape, accommodation & fear-rating rules,
  and plan-commit behaviour are **Dr. Walker's** call — the redesign re-homes these unchanged; it
  does not restyle their meaning.

---

## 5. What Claude Design should deliver

1. **The tab shell** — the four (or five, per §3) flat tabs + how the active tab reads, sitting under
   the existing `PractitionerNav` bar. No phases, no rail-swapping.
2. **Patient header / record** — a clean treatment of name · age · gender · presentations · status,
   with **profile edit** and **teen/parent access/invites** legible and well-placed (the current pain
   point). If option B/§3, this is where the plan lives too.
3. **Per-tab layouts** for Monitoring, Sessions, Experiments, Chat — showing realistic density.
4. **Where the process checklist + tips live** — one process-level treatment, available across tabs.
5. **The plan's home** — comp options A and B from §3 for a decision.

---

## 6. Inputs to hand Claude Design (checklist)

- [x] This brief (target IA, constraints, brand, deliverables).
- [x] Feature inventory (§2) — what must stay reachable, pre-grouped.
- [x] **Current-state screenshots** — 10 full-window shots captured 2026-08-09 on the "Peter Parker"
      demo patient (see §2A for the annotated catalog). Attach the images to the Design handoff.
      *(Optional gaps: Chat thread view, expanded profile/access panels.)*
- [ ] **Brand tokens / component references** — point Design at `components/ui` + the palette above,
      or an existing clean screen (e.g. the teen app post-refresh) for visual language.
- [ ] **Real content sample** — one patient's situations/experiments/session notes so comps show true
      density, not lorem ipsum.

---

## 7. After Design returns comps (Claude Code's implementation path)

- Re-home each inventory item under the chosen structure — **re-parent existing content components**,
  don't rewrite features (lower risk, but concentrated in one 4,200-line file).
- Extract the new nav shell as its own component; retire the phase/step state machine
  (`activePhase`, `activeStep`, `activePersistentTab`).
- Sequence the **Sessions unification** (the data-model piece) last and behind Dr. Walker's workflow
  decision; ship "list of session notes" first if needed.
- Verify: every §2 feature reachable under the new nav; `vite build` clean; `/security-review` on any
  change touching role scoping or the parent/child/clinician data split.
