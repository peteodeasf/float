# Float — Technical Architecture

**Version:** 0.4
**Last updated:** April 2026
**Author:** Pete O'Dea
**Status:** Living document — sections marked [OPEN] are pending clinical or product decisions

---

## Table of Contents

1. [Overview](#1-overview)
2. [Patient Lifecycle and Status Model](#2-patient-lifecycle-and-status-model)
3. [Data Model](#3-data-model)
4. [Authentication and Roles](#4-authentication-and-roles)
5. [Multi-Tenancy](#5-multi-tenancy)
6. [Database Schema](#6-database-schema)
7. [Deployment Architecture](#7-deployment-architecture)
8. [API Architecture](#8-api-architecture)
9. [Frontend Architecture](#9-frontend-architecture)
10. [AI Review System](#10-ai-review-system)
11. [Notification and Messaging System](#11-notification-and-messaging-system)
12. [Build Sequence](#12-build-sequence)
13. [Clinical Content Library](#13-clinical-content-library)
14. [Open Decisions](#14-open-decisions)

---

## 1. Overview

Float is a practitioner-led clinical platform encoding Dr. Bridget Walker's CBT model for anxiety disorders. Three users participate in treatment: the **practitioner** (configures and monitors), the **parent** (active therapeutic participant), and the **child/teen/young adult** (does the between-session therapeutic work).

The platform supports the full clinical journey from initial referral through active exposure work, following Dr. Walker's session-by-session workflow exactly.

### Core principle on AI

The language model writes clear sentences. It does not make clinical decisions. Every clinical decision is made by the rule engine (parameters set by Dr. Walker), by the practitioner, or by Dr. Walker through configuration.

### Tech stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) on Railway |
| Database | PostgreSQL on Railway |
| Web frontend | React + Vite + TypeScript on Netlify |
| Mobile frontend | React Native + Expo |
| Monorepo tooling | Turborepo |
| Email | Resend |
| Push notifications | Expo Notifications (APNs + FCM) |
| AI | Anthropic Claude API |

---

## 2. Patient Lifecycle and Status Model

This is new in v0.4. Dr. Walker's workflow revealed a structured pre-treatment phase that must be modeled explicitly.

### Patient status sequence

```
referred → monitoring → consulting → setup → active → maintenance → complete
```

| Status | Description | Who acts |
|---|---|---|
| `referred` | Email acquired, not yet contacted | Practitioner |
| `monitoring` | Monitoring form sent to parent, awaiting submission | Parent |
| `consulting` | Monitoring complete, in consultation phase (meetings 1–3) | Practitioner |
| `setup` | Treatment plan being built, ladder under construction | Practitioner |
| `active` | Exposures running, between-session work happening | Patient + Parent |
| `maintenance` | Ladders complete, consolidation phase | Patient |
| `complete` | Treatment complete | Practitioner |

### Session tracking

Sessions (consultations and treatment meetings) are tracked as first-class objects. Each session has a date, type, participants, and associated notes. Session notes are free text, practitioner-only, and referenced in subsequent sessions.

| Session type | Participants | Platform actions |
|---|---|---|
| `consultation_1` | Parents only | Notes captured, no family actions |
| `consultation_2` | Kid + parents | Nickname created, psychoeducation delivered |
| `consultation_3` | Kid + parents | Trigger list, first exposure planned, action plans generated |
| `treatment_session` | Practitioner + patient | Review progress, adjust plan, plan next exposure |

---

## 3. Data Model

### New entities in v0.4

**MonitoringForm**
Sent to the parent before consultation 1. Parent monitors child's anxiety triggers, behaviors, and distress levels for one week. Collected through Float. Fields: trigger situations observed (free text initially), behaviors observed, distress ratings, parent notes, submission date. Once submitted, Float generates a pre-consultation report.

**MonitoringFormEntry**
Individual observations within a monitoring form. One per trigger situation observed. Fields: situation description, behaviors noted, distress level (0–10), frequency, notes.

**PreConsultationReport**
Generated from monitoring form data. Practitioner-facing. Summarizes the key patterns from the monitoring week — most frequent situations, highest distress moments, accommodation behaviors observed. Referenced in consultation 1 and consultation 2.

**Session**
A clinical meeting. Belongs to a patient. Fields: session type, date, participants (practitioner, parent, child — configurable), status, notes (free text, practitioner-only). Referenced in subsequent sessions.

**ActionPlan**
Generated after consultation 3. One for the child/teen and one for the parent. Template-driven summary of what to do between sessions. Fields: plan_for (child/parent), content (structured text), generated_at, session_id.

### Updated entities in v0.4

**Experiment** — new fields and status:
- `commit_status`: `uncommitted` → `committed` — patient explicitly commits before the experiment becomes actionable
- `too_hard_flag`: boolean — patient can flag an exposure as too hard, triggering practitioner alert
- `too_hard_note`: text — patient's note when flagging too hard
- `confidence_level`: `low` / `medium` / `high` — already existed in schema, confirmed required

**TreatmentPlan** — status model updated to align with patient lifecycle:
`setup` → `active` → `maintenance` → `complete`

### Existing entities (unchanged)

Organizations, users, user_roles, practitioner_profiles, patient_profiles, parent_patient_links, treatment_plans, trigger_situations, avoidance_behaviors, exposure_ladders, ladder_rungs, downward_arrows, experiments, accommodation_behaviors, notifications, ladder_review_flags, messages.

### Key relationships (updated)

```
Patient
  ├── status: referred → monitoring → consulting → setup → active → ...
  ├── MonitoringForm (one)
  │     └── MonitoringFormEntries (many)
  ├── PreConsultationReport (one, generated)
  ├── Sessions (many)
  │     └── Session notes (free text)
  ├── TreatmentPlan (one active)
  │     ├── TriggerSituations (many)
  │     │     ├── AvoidanceBehaviors (many)
  │     │     └── ExposureLadder
  │     │           └── LadderRungs (lowest → highest DT)
  │     │                 ├── DownwardArrow
  │     │                 └── Experiments (many)
  │     │                       ├── commit_status
  │     │                       ├── too_hard_flag
  │     │                       ├── confidence_level
  │     │                       ├── Before state
  │     │                       └── After state
  │     └── AccommodationBehaviors (parent-owned)
  ├── ActionPlans (one per child, one per parent)
  └── Parents (via ParentPatientLink)
```

### Key design decisions (updated)

**Monitoring form is the parent's first platform touchpoint**
The parent receives a Float invitation to complete the monitoring form before consultation 1. This means parent onboarding happens in the `monitoring` phase, before any treatment plan exists.

**Commit action is required on experiments**
`commit_status` must be `committed` before an experiment can be run. The commit is the accountability moment — the patient explicitly agrees to do the exposure at the scheduled time.

**Too hard flag triggers practitioner alert**
When a patient flags an exposure as too hard, a notification is sent to the practitioner immediately. The practitioner can then message the patient, adjust the exposure difficulty, or discuss in the next session.

**Session notes are practitioner-only**
Free text, attached to a session record. Not visible to parents or patients. Referenced in subsequent sessions via the session history view.

**Action plans are generated summaries**
Template-driven after consultation 3. One for child, one for parent. Format to be defined once Dr. Walker provides examples. Initially stored as structured text.

**Confidence level is required on experiments**
`confidence_level` (low/medium/high) is assessed in the before state of every experiment. Distinct from BIP (belief the feared outcome will occur) and DT (expected distress level).

---

## 4. Authentication and Roles

### Authentication
- Email/password for practitioners and parents
- Invitation-based onboarding for all three user types
- Parent first invited during monitoring phase (before consultation)
- Children/younger teens: PIN or passphrase [OPEN]
- JWT with refresh tokens
- Email via Resend

### Role permissions

**Practitioner**
- Full read/write on patients' treatment plans, sessions, notes, experiments, progress
- Sends monitoring forms, generates reports, creates action plans
- Receives experiment completion, missed experiment, and too-hard notifications
- Can send messages to patients and parents

**Parent**
- Completes monitoring form (pre-consultation)
- Receives psychoeducation
- Read access to child's plan at configured visibility level
- Full read/write on own accommodation record
- Receives experiment completion notifications (if child consents)

**Patient**
- Read access to own treatment plan and ladder
- Full read/write on own experiments (including commit action and too-hard flag)
- Can message practitioner

---

## 5. Multi-Tenancy

Shared schema with org_id scoping and PostgreSQL row-level security. `organization_id` on every patient data table.

---

## 6. Database Schema

### New tables in v0.4

```sql
-- Monitoring form — sent to parent pre-consultation
CREATE TABLE monitoring_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'submitted')),
  parent_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual monitoring observations
CREATE TABLE monitoring_form_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_form_id UUID NOT NULL REFERENCES monitoring_forms(id),
  situation_description TEXT NOT NULL,
  behaviors_noted TEXT,
  distress_level DECIMAL(3,1),
  frequency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions (consultations + treatment meetings)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_type TEXT NOT NULL CHECK (
    session_type IN (
      'consultation_1', 'consultation_2', 'consultation_3', 'treatment_session'
    )
  ),
  session_date TIMESTAMPTZ,
  participants TEXT[],  -- ['practitioner', 'parent', 'child']
  notes TEXT,           -- free text, practitioner-only
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Action plans — generated after consultation 3
CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_id UUID REFERENCES sessions(id),
  plan_for TEXT NOT NULL CHECK (plan_for IN ('child', 'parent')),
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Updates to existing tables

```sql
-- experiments: add commit status, too-hard flag
ALTER TABLE experiments
  ADD COLUMN commit_status TEXT NOT NULL DEFAULT 'uncommitted'
    CHECK (commit_status IN ('uncommitted', 'committed')),
  ADD COLUMN too_hard_flag BOOLEAN DEFAULT false,
  ADD COLUMN too_hard_note TEXT;

-- patient_profiles: add lifecycle status
ALTER TABLE patient_profiles
  ADD COLUMN status TEXT NOT NULL DEFAULT 'referred'
    CHECK (status IN (
      'referred', 'monitoring', 'consulting',
      'setup', 'active', 'maintenance', 'complete'
    ));
```

---

## 7. Deployment Architecture

```
Backend         FastAPI on Railway
Database        PostgreSQL on Railway
Web             React + Vite on Netlify
Mobile          React Native + Expo (iOS + Android)
Email           Resend
Push            Expo Notifications → APNs + FCM
Storage         Cloudflare R2 (content, Phase 5+)
Future          CDC pipeline → analytics warehouse
```

---

## 8. API Architecture

### New endpoint groups in v0.4

```
/monitoring
  POST   /patients/{patient_id}/monitoring-form          # create + send form
  GET    /patients/{patient_id}/monitoring-form          # get form status + entries
  POST   /monitoring-forms/{form_id}/entries             # parent submits entry
  GET    /patients/{patient_id}/pre-consultation-report  # generated report

/sessions
  GET    /patients/{patient_id}/sessions
  POST   /patients/{patient_id}/sessions
  PUT    /sessions/{session_id}
  PUT    /sessions/{session_id}/notes

/action-plans
  GET    /patients/{patient_id}/action-plans
  POST   /patients/{patient_id}/action-plans

/experiments  (updated)
  PUT    /experiments/{experiment_id}/commit             # patient commits
  PUT    /experiments/{experiment_id}/too-hard           # patient flags too hard
```

### Background jobs

- **Missed experiment detection** — every 30 min, alerts practitioner
- **Too-hard alerts** — immediate on flag, alerts practitioner
- **Experiment reminders** — push to patient before scheduled time
- **Check-in prompts** — configurable frequency

---

## 9. Frontend Architecture

### Web dashboard updates

**New views:**
- Patient referral intake form (name, email, referred by)
- Monitoring form dispatch — send form to parent, track submission status
- Pre-consultation report view — generated from monitoring data
- Session log — list of sessions with notes, referenced in current session
- Action plan generator — create and view plans for child and parent
- Patient status indicator — where in the lifecycle is this patient

**Updated caseload view:**
- Patient status badge (referred / monitoring / consulting / setup / active)
- Monitoring form status (pending / submitted)
- Missed experiment and too-hard alerts

**Updated patient detail:**
- Session history with notes
- Monitoring report tab
- Action plans tab

### Mobile app updates

**New screens:**
- Commit screen — explicit commit to upcoming exposure
- Too hard flow — flag exposure, add note, see confirmation practitioner notified
- My experiments — upcoming, committed, completed

---

## 10. AI Review System

### Flag types (updated)

| Type | Description |
|---|---|
| `STARTING_DISTRESS_TOO_HIGH` | First rung exceeds recommended threshold |
| `RUNG_GAP_TOO_LARGE` | Gap between adjacent rungs too large |
| `INSUFFICIENT_RUNGS` | Fewer rungs than recommended minimum |
| `MISSING_DOWNWARD_ARROW` | Rung has no Downward Arrow |
| `FEARED_OUTCOME_NOT_APPROVED` | Downward Arrow not yet approved by practitioner |
| `MISSING_BEHAVIOR_REFERENCE` | Rung has no associated avoidance behavior |
| `EXPERIMENT_TOO_HARD` | Patient flagged exposure as too hard |

---

## 11. Notification and Messaging System

### Notification types (updated)

| Type | Trigger | Recipients |
|---|---|---|
| `experiment_completed` | Patient completes experiment | Practitioner + Parent (if consent) |
| `experiment_missed` | Scheduled time passes, not completed | Practitioner |
| `experiment_too_hard` | Patient flags too hard | Practitioner (immediate) |
| `experiment_reminder` | Before scheduled experiment | Patient |
| `monitoring_form_submitted` | Parent submits monitoring form | Practitioner |
| `checkin_prompt` | Configurable frequency | Patient + Parent |
| `practitioner_message` | Practitioner sends message | Patient or Parent |

---

## 12. Build Sequence

### Phase 1 — Foundation ✓ Complete
Practitioner can onboard a patient, build a treatment plan, construct a ladder, run AI review.

### Phase 2 — Teen Experience ✓ API Complete, Mobile In Progress
Teen can run experiments. Practitioner monitors via web dashboard. Downward Arrow, Messages, missed experiment detection all built.

**Remaining Phase 2:**
- Mobile app connection and experiment flow
- Commit action on experiments
- Too-hard flag on experiments

### Phase 3 — Pre-treatment Workflow
Referral intake, monitoring form (send + collect), pre-consultation report, session notes, patient lifecycle status, action plans.

### Phase 4 — Notification System
Full notification types including too-hard alerts, monitoring form submission. Push notifications to mobile.

### Phase 5 — Parent Experience
Parent module, accommodation ladder, parent notifications, visibility-scoped plan view.

### Phase 6 — Educational Content
Psychoeducation for all three users. Practitioner training. Downward Arrow exercises.

### Phase 7 — OCD/ERP Track
Same workflow, ERP substituted for exposure. On roadmap, no separate implementation needed yet.

---

## 13. Clinical Content Library

**Status: Not yet built — pre-launch requirement**

A curated set of canonical trigger situations and avoidance/safety behaviors defined by Dr. Walker. Practitioners browse and add to patient plans with one click, editable for patient nuance. Enables population-level analytics.

```sql
CREATE TABLE clinical_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('trigger_situation', 'avoidance_behavior')),
  name TEXT NOT NULL,
  description TEXT,
  behavior_type TEXT,
  suggested_dt_min DECIMAL(3,1),
  suggested_dt_max DECIMAL(3,1),
  anxiety_tags TEXT[],
  created_by TEXT DEFAULT 'dr_walker',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Add `library_item_id` as optional FK on `trigger_situations` and `avoidance_behaviors`.

---

## 14. Open Decisions

| # | Decision | Waiting on | Notes |
|---|---|---|---|
| 1 | Monitoring form format and fields | Dr. Walker | Form requested — will model schema once received |
| 2 | Action plan format and template | Dr. Walker | Examples requested |
| 3 | Minimum age for independent mobile use | Dr. Walker | Affects parent notification routing |
| 4 | Messaging scope — simple text sufficient? | Dr. Walker | Current design is lightweight in-app text |
| 5 | Accommodation ladder — same review flow as exposure ladder? | Dr. Walker | Assumed yes |
| 6 | Parent visibility level definitions | Dr. Walker | Architecture supports it; content TBD |
| 7 | Downward Arrow psychoeducation format | Dr. Walker | Required for all users before setup |
| 8 | Check-in frequency configuration options | Dr. Walker | Daily ideal, weekly minimum confirmed |
| 9 | Hassles list workflow | Dr. Walker | Not yet addressed |
| 10 | Clinical content library ownership | Dr. Walker + Product | Pre-launch requirement |
| 11 | Multi-org support timing | Product | Single org for now |

---

*Float Technical Architecture — Living Document — v0.4 — April 2026*
