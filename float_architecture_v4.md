# Float — Technical Architecture

**Version:** 0.3  
**Last updated:** April 2026  
**Author:** Pete O'Dea  
**Status:** Living document — sections marked [OPEN] are pending clinical or product decisions

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Authentication and Roles](#3-authentication-and-roles)
4. [Multi-Tenancy](#4-multi-tenancy)
5. [Database Schema](#5-database-schema)
6. [Deployment Architecture](#6-deployment-architecture)
7. [API Architecture](#7-api-architecture)
8. [Frontend Architecture](#8-frontend-architecture)
9. [AI Review System](#9-ai-review-system)
10. [Notification and Messaging System](#10-notification-and-messaging-system)
11. [Build Sequence](#11-build-sequence)
12. [Clinical Content Library](#12-clinical-content-library)
13. [Open Decisions](#13-open-decisions)

---

## 1. Overview

Float is a practitioner-led clinical platform that puts Dr. Bridget Walker's CBT model for anxiety disorders in the hands of school social workers and community therapists. Three users participate in the treatment: the **practitioner** (configures and monitors), the **parent** (active therapeutic participant), and the **child/teen/young adult** (does the between-session therapeutic work).

### Core principle on AI

The language model does one thing: writes clear sentences. It does not make clinical decisions. Every clinical decision is either made by the rule engine (parameters set by Dr. Walker), by the practitioner, or by Dr. Walker herself through configuration. The language model translates structured data into readable prose. Reasoning happens upstream.

### Tech stack at a glance

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) on Railway |
| Database | PostgreSQL on Railway |
| Cache | Redis on Railway |
| Web frontend | React + Vite + TypeScript on Netlify |
| Mobile frontend | React Native + Expo |
| Monorepo tooling | Turborepo |
| File storage | Cloudflare R2 |
| Email | Resend |
| Push notifications | Expo Notifications (APNs + FCM) |
| AI | Anthropic Claude API |

---

## 2. Data Model

### Core entities

**Organization**  
Top-level multi-tenancy boundary. Float is sold to schools and practices. All patient data is scoped to an organization. A solo practitioner in private practice is a single-practitioner organization.

**User + UserRole**  
User identity (email, credentials) is separate from role. One person can be both a parent and a practitioner. Three roles: `practitioner`, `parent`, `patient`.

**PractitionerProfile / PatientProfile**  
Role-specific profile data attached to a user. A patient profile holds date of birth, primary practitioner reference, and organization scope.

**ParentPatientLink**  
Join table connecting parent users to patient records. A patient can have multiple parents; a parent can have multiple children in the system.

**TreatmentPlan**  
One active plan per patient at a time. Contains the clinical track (exposure vs ERP — ERP out of scope for v1), parent visibility level, and status (setup → active → maintenance → complete).

**TriggerSituation**  
Belongs to a treatment plan. Represents a situation that triggers the patient's anxiety. Has a DT rating and a display order. The starting situation for treatment is the one with the lowest DT that occurs frequently.

**AvoidanceBehavior**  
Belongs to a trigger situation. Has a `behavior_type` of `avoidance`, `safety`, or `ritual`. Has a `distress_thermometer_when_refraining` rating — this is what the exposure ladder rungs are built from.

**DownwardArrow**  
Belongs to a ladder rung. Records the structured drill-down conversation that surfaces the child's most feared outcome for that specific rung. Fields: each arrow step (question → response pairs), the final feared outcome, and the BIP derived from that outcome. Can be facilitated by parent or practitioner; practitioner must approve the final feared outcome is drilled down sufficiently. Has therapeutic value on its own.

**ExposureLadder**  
Belongs to a trigger situation. An ordered set of rungs arranged from lowest to highest DT. Status: `not_started`, `active`, `complete`.

**LadderRung**  
Belongs to a ladder. References an avoidance behavior. Has a DT rating and a rung order (0 = bottom/easiest, ascending = harder). Status tracks progression. Has an associated DownwardArrow record once facilitated.

**Experiment**  
The core transactional entity. Belongs to a ladder rung. Has two distinct states — before and after — captured at different times (sometimes hours or days apart). Has a required scheduled date/time — exposures must be planned ahead.

Before state: what the patient plans to do, the feared outcome (from Downward Arrow), BIP before, expected DT, behaviors they might be tempted to do, confidence level.

After state: did the feared outcome occur (must be observable, not based on feelings), what actually happened, actual DT, updated BIP, what they learned.

**AccommodationBehavior**  
Parent-facing parallel to avoidance behaviors. Belongs to the treatment plan and the parent user. Tracks behaviors the parent (or sibling) does that maintain the child's anxiety, with DT ratings for refraining. Arranged as an accommodation ladder from lowest to highest DT — mirrors the exposure ladder structure.

**LadderReviewFlag**  
Created by the AI review system. Belongs to a ladder. Has a machine-readable type, structured data, and a generated human-readable description. Status: `open`, `dismissed`, `resolved`.

**Notification**  
Between-session communication. Types: `experiment_completed`, `experiment_missed`, `practitioner_message`, `checkin_prompt`. Has scheduled and delivered timestamps. Experiment completion notifications go to both practitioner and parent (if parent consent given). Missed experiment notifications go to practitioner.

**Message**  
Direct communication between practitioner and patient (or parent). Lightweight messaging layer for between-session follow-up. Practitioner can use this to check in when an experiment is missed or to provide encouragement. Does not replace clinical session — supplements accountability.

### Key relationships

```
Organization
  └── Practitioners (many)
  └── Patients (many)

Patient
  ├── TreatmentPlan (one active)
  │     ├── TriggerSituations (many, ordered by DT)
  │     │     ├── AvoidanceBehaviors (many)
  │     │     └── ExposureLadder
  │     │           └── LadderRungs (ordered low→high DT)
  │     │                 ├── DownwardArrow
  │     │                 └── Experiments (many)
  │     │                       ├── Before state
  │     │                       └── After state
  │     └── AccommodationBehaviors (many, parent-owned)
  │           └── AccommodationLadder (ordered low→high DT)
  ├── Parents (many, via ParentPatientLink)
  └── Practitioner (primary)
```

### Key design decisions

**Ladder ordering: lowest to highest DT**  
Confirmed by Dr. Walker. The bottom rung is the easiest (lowest DT). Treatment progresses upward. Rung order 0 = easiest, ascending = harder. The first exposure is always the bottom rung.

**Downward Arrow is per rung, not per trigger situation**  
Each rung has its own Downward Arrow — the feared outcome may differ across behaviors within the same trigger situation. The final feared outcome from the Downward Arrow IS the prediction used in the experiment's before state. BIP is derived from this — how strongly does the child believe this outcome will occur.

**Experiment requires a scheduled date/time**  
`scheduled_date` is required, not optional. Exposures must be planned ahead for specific times and days. The notification system monitors for missed experiments and alerts the practitioner when a planned time passes without completion.

**Feared outcome observability**  
The feared outcome documented in the Downward Arrow must be something observable by all — not based on feelings or intuition. The after-state question "did the feared outcome occur" must be answerable objectively. This is a clinical constraint that should be enforced in the UI.

**BIP is experiment-level only**  
BIP belongs to experiments (`bip_before`, `bip_after`). It measures belief in the specific feared outcome for a specific experiment. Progress in BIP is derived across sequential experiments.

**Accommodation ladder mirrors exposure ladder**  
The parent's accommodation behaviors are arranged as a ladder from lowest to highest DT (for refraining from each behavior). This uses the same structural logic as the exposure ladder. The parent module is built and managed by the practitioner alongside the exposure plan.

**Family accommodation scope**  
Accommodation includes parental behaviors AND sibling behaviors. The `AccommodationBehavior` model should track who performs the accommodation (parent, sibling, other family member) not just what the behavior is.

**Clinical content library**  
[See Section 12] — pre-launch requirement for practitioner efficiency and population analytics. Not built yet.

---

## 3. Authentication and Roles

### Authentication

- Email/password for practitioners and parents
- Invitation-based onboarding for all three user types
- Children/younger teens: PIN or passphrase [OPEN — confirm age threshold with Dr. Walker]
- JWT-based auth with refresh tokens
- Email delivery via Resend

### Role permissions

**Practitioner**
- Full read/write on their patients' treatment plans, experiments, progress
- Read access to parent accommodation records
- Can invite patients and parents
- Receives experiment completion and missed experiment notifications
- Can send messages to patients and parents
- Org admin: manage other practitioner accounts, org-level reporting

**Parent**
- Read access to child's treatment plan at configured visibility level
- Full read/write on their own accommodation record
- Receives experiment completion notifications (if child consents)
- Can view child's experiment schedule and results at configured visibility
- Cannot modify the treatment plan

**Patient (child/teen/young adult)**
- Read access to their own treatment plan and ladder
- Full read/write on their own experiments
- Cannot modify treatment plan configuration
- Can message their practitioner

### Regulatory flags

HIPAA, FERPA, COPPA. Flag every infrastructure decision against these constraints.

---

## 4. Multi-Tenancy

**Approach: Shared schema with org_id scoping + row-level security**

`organization_id` on every patient data table. RLS enforced at the database level as a safety net.

### Row-level security pattern

```sql
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON experiments
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

Middleware sets `app.current_org_id` at the start of every request.

### Future analytics pipeline

Design schema with clean timestamps and audit fields for eventual CDC pipeline to Redshift or BigQuery.

---

## 5. Database Schema

PostgreSQL on Railway. Key additions since v0.2: `downward_arrows`, `messages` tables. Updates to `experiments` (scheduled_date required), `accommodation_behaviors` (accommodator field).

```sql
-- Downward Arrow — per ladder rung
CREATE TABLE downward_arrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ladder_rung_id UUID NOT NULL REFERENCES ladder_rungs(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  -- Arrow steps stored as JSONB array: [{question, response}, ...]
  arrow_steps JSONB NOT NULL DEFAULT '[]',
  feared_outcome TEXT,           -- the final drilled-down outcome
  feared_outcome_approved BOOLEAN DEFAULT false,  -- practitioner approved
  bip_derived DECIMAL(5,2),      -- BIP % derived from this outcome
  facilitated_by TEXT CHECK (facilitated_by IN ('practitioner', 'parent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages — practitioner ↔ patient/parent
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  sender_user_id UUID NOT NULL REFERENCES users(id),
  recipient_user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (
    message_type IN ('check_in', 'encouragement', 'adjustment', 'general')
  ),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Updates to existing tables:

```sql
-- experiments: scheduled_date is now required
ALTER TABLE experiments ALTER COLUMN scheduled_date SET NOT NULL;

-- accommodation_behaviors: add accommodator field
ALTER TABLE accommodation_behaviors 
  ADD COLUMN accommodator TEXT DEFAULT 'parent' 
  CHECK (accommodator IN ('parent', 'sibling', 'other'));
```

Full schema from v0.1 remains — organizations, users, user_roles, practitioner_profiles, patient_profiles, parent_patient_links, treatment_plans, trigger_situations, avoidance_behaviors, exposure_ladders, ladder_rungs, experiments, accommodation_behaviors, ladder_review_flags, notifications.

---

## 6. Deployment Architecture

```
Backend
  FastAPI on Railway
  PostgreSQL on Railway
  Redis on Railway (progress data caching, Phase 2+)
  Anthropic Claude API (Phase 4+)

Web (Practitioner + Parent)
  React + Vite on Netlify

Mobile (Teen/Young Adult)
  React Native + Expo
  iOS — App Store via Expo EAS Build
  Android — Google Play via Expo EAS Build
  OTA updates — Expo Updates

Storage
  Cloudflare R2 (educational content, Phase 4+)

Email
  Resend

Push Notifications
  Expo Notifications → APNs (iOS) + FCM (Android)

Future
  CDC pipeline → Redshift or BigQuery
```

---

## 7. API Architecture

RESTful. New endpoint groups since v0.2: downward arrows, messages. Updates to experiments (scheduling required), notifications (new types).

### Monorepo structure

```
float/
  apps/
    web/               React — practitioner + parent dashboard
    mobile/            React Native + Expo — teen/young adult experience
  packages/
    api-client/        Shared — API calls, auth, React Query hooks, types
    clinical-logic/    Shared — data transforms, progress calculations,
                       ladder validation, display formatting
    ui-tokens/         Shared — colors, typography, spacing
  backend/             FastAPI
  turbo.json
  package.json
```

### New/updated endpoint groups

```
/downward-arrows
  GET    /rungs/{rung_id}/downward-arrow
  POST   /rungs/{rung_id}/downward-arrow
  PUT    /downward-arrows/{da_id}
  PUT    /downward-arrows/{da_id}/approve     # practitioner approves feared outcome

/messages
  GET    /patients/{patient_id}/messages
  POST   /patients/{patient_id}/messages
  PUT    /messages/{message_id}/read

/experiments  (updated)
  POST   /rungs/{rung_id}/experiments         # scheduled_date now required
  GET    /patients/{patient_id}/experiments/missed    # missed experiment list
```

### Background jobs (Railway cron)

- **Missed experiment detection** — runs every 30 minutes; checks for experiments where `scheduled_date` has passed and status is still `planned` or `in_progress`; creates `experiment_missed` notifications for practitioner
- **Experiment reminders** — push notifications to teens before scheduled experiment time
- **Check-in prompts** — configurable frequency per practitioner preference

---

## 8. Frontend Architecture

### Web dashboard (React)

**Updated routes:**

```
/patients/:patientId/downward-arrow/:rungId    Downward Arrow facilitation
/patients/:patientId/messages                  Messaging with patient
```

**Key UI additions:**

*Downward Arrow facilitation view* — practitioner or parent works through the arrow steps with the child. Each step is a question → response pair. The final feared outcome is confirmed and approved by the practitioner. BIP is set from this outcome. The feared outcome must be stated in observable terms.

*Missed experiment alerts* — in the caseload view and patient view, clear visual indicators when a patient has missed a planned experiment. One-click to send a message.

*Accommodation ladder* — parallel to the exposure ladder but for the parent module. Same UI pattern, different clinical content.

### Mobile app (React Native + Expo)

**Updated experiment flow:**

The feared outcome displayed in the experiment flow comes from the Downward Arrow, not free text. The patient sees: "Your prediction: [feared outcome from Downward Arrow]" — they cannot change it, only rate their BIP.

After the experiment, the "did the feared thing happen" question must be answered in observable terms. The UI should prompt: "Think about whether this is something anyone watching could confirm — not just how you felt."

**Messaging in mobile:**

Simple in-app message view — patient can see messages from their practitioner and reply. Push notification when a new message arrives.

---

## 9. AI Review System

### Architecture

```
Ladder Review Service
  ├── Rule Engine       deterministic checks, parameters from config
  ├── Flag Generator    Claude API — natural language descriptions only
  └── Flag Store        persisted to ladder_review_flags table
```

### Updated rule parameters (confirmed by Dr. Walker)

```json
{
  "ladder_rules": {
    "max_starting_distress_thermometer": 4.0,
    "min_rungs": 3,
    "max_rung_gap": 2.0,
    "require_downward_arrow_per_rung": true,
    "require_practitioner_approval": false
  }
}
```

Note: `require_downward_arrow_per_rung` is new — each rung should have an associated Downward Arrow before experiments begin.

### Flag types (updated)

| Type | Description |
|---|---|
| `STARTING_DISTRESS_TOO_HIGH` | First rung exceeds recommended starting threshold |
| `RUNG_GAP_TOO_LARGE` | Gap between adjacent rungs exceeds recommended maximum |
| `INSUFFICIENT_RUNGS` | Ladder has fewer rungs than recommended minimum |
| `MISSING_DOWNWARD_ARROW` | Rung has no associated Downward Arrow |
| `FEARED_OUTCOME_NOT_APPROVED` | Downward Arrow exists but practitioner hasn't approved the feared outcome |
| `MISSING_BEHAVIOR_REFERENCE` | Rung has no associated avoidance behavior |

---

## 10. Notification and Messaging System

This section is new in v0.3 — Dr. Walker's between-session workflow guidance made clear that the notification system is more complex than originally scoped.

### Notification types

| Type | Trigger | Recipients |
|---|---|---|
| `experiment_completed` | Patient completes an experiment | Practitioner + Parent (if consent given) |
| `experiment_missed` | Scheduled experiment time passes without completion | Practitioner only |
| `experiment_reminder` | Configurable time before scheduled experiment | Patient |
| `checkin_prompt` | Configurable frequency | Patient + Parent |
| `practitioner_message` | Practitioner sends a message | Patient or Parent |

### Missed experiment detection

A background job runs every 30 minutes and checks for experiments where:
- `scheduled_date` < now
- `status` IN ('planned', 'in_progress')
- No `experiment_missed` notification already sent

When found, creates an `experiment_missed` notification for the practitioner. The practitioner can then send a message to the patient via the messaging layer.

### Parent consent for notifications

When onboarding a patient, the practitioner configures:
- Does the parent receive completion notifications? (boolean)
- Does the parent have visibility into experiment content? (depends on `parent_visibility_level`)

For younger children where the parent communicates DT and BIP on the child's behalf, the parent receives all notifications the patient would receive.

### Messaging layer

Lightweight in-app messaging between practitioner and patient (and practitioner and parent). Not a full chat system — structured around clinical context:

- Message types: `check_in`, `encouragement`, `adjustment`, `general`
- Practitioner can send from the missed experiment alert or the patient view
- Patient receives push notification when a message arrives
- Simple reply — not threaded, not group

This supports Dr. Walker's model of practitioners being present during first exposures (via external video call) and following up when experiments are missed. Float does not host the video call — it facilitates the coordination.

---

## 11. Build Sequence

Each phase is independently usable. Updated to reflect Dr. Walker's clinical guidance.

### Phase 1 — Foundation ✓ Complete
Practitioner can onboard a patient, build a treatment plan with triggers and behaviors, construct an exposure ladder, and run AI review.

### Phase 2 — Teen Experience ✓ API Complete, Mobile In Progress
Teen can run experiments between sessions. Practitioner can monitor results via web dashboard.

**Remaining Phase 2:**
- Downward Arrow API and UI
- Scheduled date requirement on experiments
- Missed experiment detection background job
- Experiment completion notifications
- React Native mobile app — login and experiment flow

### Phase 3 — Notification and Messaging System
Full notification system as described in Section 10. Messaging layer between practitioner and patient. Parent completion notifications.

### Phase 4 — Parent Experience
Parent module: accommodation monitoring, accommodation ladder, gradual reduction plan. Parent notifications. Visibility-scoped child plan view.

### Phase 5 — Educational Content and AI Synthesis
Psychoeducation content for all three users. Practitioner training including Downward Arrow exercises and quizzes. Claude integration for flag descriptions, brief synthesis, coaching nudges.

### Phase 6 — OCD/ERP Track
Out of scope for initial version. Architecture supports it when needed.

---

## 12. Clinical Content Library

**Status: Not yet built — pre-launch requirement**

### The problem

Every patient's treatment plan currently requires practitioners to type trigger situations and avoidance behaviors from scratch. Without a shared vocabulary, population-level analysis is impossible.

### What the library is

A curated set of canonical trigger situations and avoidance/safety behaviors that practitioners can browse and add to a patient's plan with one click. Defined by Dr. Walker. Each item has a canonical name, description, suggested DT range, behavior type, and anxiety presentation tags (social anxiety, perfectionism, separation anxiety, etc.).

When a practitioner adds a library item to a patient's plan, it creates an instance linked back to the library item by ID but editable for patient-specific nuance.

### Why this matters for analytics

With library items, Float can aggregate across patients: which situations are most prevalent, which behaviors are hardest to relinquish, which ladder configurations produce the best BIP outcomes, which situations respond fastest to exposure work.

### Data model additions needed

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

Add `library_item_id` as optional foreign key on `trigger_situations` and `avoidance_behaviors`.

### When to build

Before general availability — not needed for Dr. Walker's initial pilot review, but required before onboarding school practitioners at scale.

---

## 13. Open Decisions

| # | Decision | Waiting on | Notes |
|---|---|---|---|
| 1 | Minimum age for independent mobile app use vs. parent-mediated | Dr. Walker | Affects mobile UX and parent notification routing |
| 2 | Messaging layer scope — simple text vs. richer tools | Dr. Walker | Current design: lightweight in-app text; confirm sufficient |
| 3 | Accommodation ladder — built and reviewed by practitioner same as exposure ladder? | Dr. Walker | Assumed yes based on parallel structure |
| 4 | Parent visibility level definitions — exact scope of full/summary/minimal | Dr. Walker | Architecture supports it; content needs definition |
| 5 | Downward Arrow psychoeducation module — format and sequencing | Dr. Walker | Required for all users before setup begins |
| 6 | Practitioner training content — what beyond Downward Arrow and core model | Dr. Walker | Exercises and quizzes confirmed; scope TBD |
| 7 | Parent psychoeducation — most important concepts before starting parent module | Dr. Walker | Sequence of parent module confirmed; content TBD |
| 8 | Feared outcome observability — how to enforce in UI that outcome must be observable | Clinical + Product | Current plan: UI prompt; may need practitioner review step |
| 9 | Check-in frequency configuration — what options to offer practitioners | Dr. Walker | Daily ideal, weekly minimum; configurable confirmed |
| 10 | Hassles list — at what point in the process, who completes it | Dr. Walker | Not yet addressed |
| 11 | Multi-org support timing | Product decision | Single org is simpler but migration later has cost |
| 12 | Clinical content library — scope and Dr. Walker's ownership of initial content | Dr. Walker + Product | See Section 12 — pre-launch requirement |

---

*Float Technical Architecture — Living Document — v0.3 — April 2026*
