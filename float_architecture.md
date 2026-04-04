# Float — Technical Architecture

**Version:** 0.1  
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
10. [Build Sequence](#10-build-sequence)
11. [Open Decisions](#11-open-decisions)

---

## 1. Overview

Float is a practitioner-led clinical platform that puts Dr. Bridget Walker's CBT model for anxiety disorders in the hands of school social workers and community therapists. Three users participate in the treatment: the **practitioner** (configures and monitors), the **parent** (active therapeutic participant), and the **child/teen** (does the between-session therapeutic work).

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
One active plan per patient at a time. The container for the full clinical configuration — clinical track (exposure vs ERP), parent visibility level, and status (setup → active → maintenance → complete). Plans are versioned — changes are tracked, history is preserved.

**TriggerSituation**  
Belongs to a treatment plan. Represents a situation that triggers the patient's anxiety. Has a distress thermometer rating and a display order.

**AvoidanceBehavior**  
Belongs to a trigger situation. Has a `behavior_type` of `avoidance`, `safety`, or `ritual` (ritual for OCD track). Has a `distress_thermometer_when_refraining` rating — this is what the exposure ladder is built from.

**ExposureLadder**  
Belongs to a trigger situation. An ordered set of rungs. Has a status: `not_started`, `active`, `complete`.

**LadderRung**  
Belongs to a ladder. References an avoidance behavior. Has a distress thermometer rating and a rung order. Status tracks progression.

**Experiment**  
The core transactional entity. Belongs to a ladder rung. Has two distinct states — before and after — captured at different times (sometimes hours or days apart).

Before state: what the patient plans to do, their prediction, BIP rating, expected distress thermometer, tempting behaviors, confidence level.

After state: did the feared thing happen, what actually happened, actual distress thermometer, updated BIP rating, what they learned.

**AccommodationBehavior**  
Parent-facing parallel to avoidance behaviors. Belongs to the treatment plan and the parent user. Tracks behaviors the parent does that maintain the child's anxiety, with distress thermometer ratings and progress toward relinquishing them.

**LadderReviewFlag**  
Created by the AI review system. Belongs to a ladder. Has a machine-readable type, structured data about the violation, and a generated human-readable description. Status: `open`, `dismissed`, `resolved`.

**Notification**  
Between-session communication. Types: `experiment_reminder`, `checkin_prompt`, `practitioner_message`. Has scheduled and delivered timestamps.

### Key relationships

```
Organization
  └── Practitioners (many)
  └── Patients (many)

Patient
  ├── TreatmentPlan (one active)
  │     ├── TriggerSituations (many)
  │     │     ├── AvoidanceBehaviors (many)
  │     │     └── ExposureLadder
  │     │           └── LadderRungs (ordered)
  │     │                 └── Experiments (many)
  │     │                       ├── Before state
  │     │                       └── After state
  │     └── AccommodationBehaviors (many, parent-owned)
  ├── Parents (many, via ParentPatientLink)
  └── Practitioner (primary)
```

### Key design decisions

**Clinical track as treatment plan attribute**  
The exposure track and ERP (OCD) track are structurally parallel — trigger situations, behaviors/rituals, ladder, experiments. One data model handles both. The `clinical_track` field on TreatmentPlan determines labeling and rule parameters. `behavior_type` on AvoidanceBehavior distinguishes avoidance, safety, and ritual behaviors.

**BIP is experiment-level only**  
BIP (Belief in Prediction) is not a property of a situation or ladder rung. It measures how strongly a patient believes a specific feared outcome will happen before a specific experiment, and then again after. It lives entirely within the Experiment entity as `bip_before` and `bip_after`. Progress in BIP is derived — computed across sequential experiment records — not stored anywhere else in the hierarchy.

**Distress thermometer lives at multiple levels**  
Unlike BIP, the distress thermometer appears on trigger situations (baseline anxiety), avoidance behaviors (cost of refraining), ladder rungs (expected difficulty), and experiments (predicted and actual). It measures different things at each level. Stored as a decimal(3,1) — range 0.0 to 10.0.

**Treatment plan versioning**  
Plans are mutable but changes are tracked. A change history table records what changed, when, and by whom. This matters for outcome analysis — you need to know the state of the plan at the time of each experiment.

**Parent visibility is configurable**  
The practitioner sets `parent_visibility_level` on the treatment plan: `full`, `summary`, or `minimal`. This is especially important for teens where some clinical privacy may be appropriate. The exact levels are [OPEN] pending Dr. Walker's input — but the architecture supports configurable visibility from the start.

---

## 3. Authentication and Roles

### Authentication

- Email/password for practitioners and parents
- Invitation-based onboarding for all three user types — no self-registration for patients or parents
- Children/younger teens: PIN or passphrase rather than full password [OPEN — confirm with Dr. Walker what age threshold applies]
- JWT-based auth with refresh tokens
- Secure session management, HTTPS everywhere
- Email delivery via Resend (same as Mitora)

### Role permissions

**Practitioner**
- Full read/write on their own patients' treatment plans, experiments, progress
- Read access to parent accommodation records for their patients
- Can invite patients and parents
- Cannot access other practitioners' patients unless explicitly granted
- Org admin practitioners: manage other practitioner accounts, org-level reporting

**Parent**
- Read access to child's treatment plan at the configured visibility level
- Full read/write on their own accommodation record
- View child's experiment schedule and results at configured visibility level
- Cannot modify the treatment plan
- Cannot see other patients

**Patient (child/teen)**
- Read access to their own treatment plan and ladder
- Full read/write on their own experiments
- Cannot see accommodation records
- Cannot modify treatment plan configuration

### Org scoping

`organization_id` is derived from the authenticated user's session on the backend. The frontend never passes `org_id` explicitly — it is injected by middleware. This prevents any possibility of client-side org_id manipulation.

### Regulatory flags

Float handles clinical data about minors. Relevant US regulations:

- **HIPAA** — if used by healthcare practitioners or health systems. PHI rules apply. BAAs required with any third-party touching patient data.
- **FERPA** — if deployed in schools. Student educational records coverage.
- **COPPA** — for children under 13. Parental consent requirements for data collection.

These shape infrastructure choices — data residency, third-party services, consent flows at onboarding. Flag every infrastructure decision against these constraints.

---

## 4. Multi-Tenancy

**Approach: Shared schema with org_id scoping + row-level security**

Single database, single schema, `organization_id` foreign key on every table that holds patient data. All queries are scoped by org_id. Row-level security (RLS) in PostgreSQL is enforced as a safety net — even a bug in application code cannot return another org's data.

Chosen over separate-database-per-org (too operationally heavy at this stage) and separate-schema-per-org (migration complexity doesn't justify the isolation benefit).

### Row-level security pattern

```sql
-- Enable RLS on every patient data table
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see rows in their organization
CREATE POLICY org_isolation ON experiments
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

Middleware sets `app.current_org_id` at the start of every request from the authenticated user's session. Runs before any database query.

### Edge cases

**Solo practitioners** — a practitioner without institutional affiliation is a single-practitioner organization. No special handling needed — the org model supports it naturally.

**Shared patients** — a student working with both a school social worker and an outside therapist. The data model supports a primary practitioner with read-only access granted to a secondary. This is an explicit share, never automatic.

**Patient transfers** — student moves schools, practitioner leaves. Treatment record transfers with explicit reassignment. No data loss.

### Future analytics pipeline

Experiment results and progress data should be designed for eventual export to a data warehouse. When Float reaches scale, a CDC (Change Data Capture) pipeline from PostgreSQL to Redshift or BigQuery is the right path. Railway supports this. Build the schema with clean timestamps and audit fields from day one so the pipeline is straightforward when needed.

---

## 5. Database Schema

PostgreSQL on Railway. All tables include `organization_id` for RLS scoping.

```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('school', 'practice', 'solo')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('practitioner', 'parent', 'patient')),
  is_org_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Practitioner profiles
CREATE TABLE practitioner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  credentials TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patient profiles
CREATE TABLE patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  date_of_birth DATE,
  primary_practitioner_id UUID REFERENCES practitioner_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parent-patient links
CREATE TABLE parent_patient_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Treatment plans
CREATE TABLE treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
  clinical_track TEXT NOT NULL CHECK (clinical_track IN ('exposure', 'erp')),
  parent_visibility_level TEXT NOT NULL DEFAULT 'summary'
    CHECK (parent_visibility_level IN ('full', 'summary', 'minimal')),
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'active', 'maintenance', 'complete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger situations
CREATE TABLE trigger_situations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  distress_thermometer_rating DECIMAL(3,1) CHECK (
    distress_thermometer_rating BETWEEN 0 AND 10
  ),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Avoidance and safety behaviors (includes rituals for OCD track)
CREATE TABLE avoidance_behaviors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_situation_id UUID NOT NULL REFERENCES trigger_situations(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  behavior_type TEXT NOT NULL CHECK (
    behavior_type IN ('avoidance', 'safety', 'ritual')
  ),
  distress_thermometer_when_refraining DECIMAL(3,1) CHECK (
    distress_thermometer_when_refraining BETWEEN 0 AND 10
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exposure ladders
CREATE TABLE exposure_ladders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_situation_id UUID NOT NULL REFERENCES trigger_situations(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'active', 'complete')),
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'reviewed', 'approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ladder rungs
CREATE TABLE ladder_rungs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ladder_id UUID NOT NULL REFERENCES exposure_ladders(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  avoidance_behavior_id UUID REFERENCES avoidance_behaviors(id),
  distress_thermometer_rating DECIMAL(3,1) CHECK (
    distress_thermometer_rating BETWEEN 0 AND 10
  ),
  rung_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'active', 'complete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Experiments
CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ladder_rung_id UUID NOT NULL REFERENCES ladder_rungs(id),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped')),
  -- Before state
  plan_description TEXT,
  prediction TEXT,
  bip_before DECIMAL(5,2) CHECK (bip_before BETWEEN 0 AND 100),
  distress_thermometer_expected DECIMAL(3,1) CHECK (
    distress_thermometer_expected BETWEEN 0 AND 10
  ),
  tempting_behaviors TEXT,
  confidence_level TEXT CHECK (
    confidence_level IN ('high', 'medium', 'low')
  ),
  -- After state
  feared_outcome_occurred BOOLEAN,
  what_happened TEXT,
  distress_thermometer_actual DECIMAL(3,1) CHECK (
    distress_thermometer_actual BETWEEN 0 AND 10
  ),
  bip_after DECIMAL(5,2) CHECK (bip_after BETWEEN 0 AND 100),
  what_learned TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accommodation behaviors (parent-facing)
CREATE TABLE accommodation_behaviors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id),
  parent_user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  distress_thermometer_when_refraining DECIMAL(3,1) CHECK (
    distress_thermometer_when_refraining BETWEEN 0 AND 10
  ),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'relinquished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ladder review flags
CREATE TABLE ladder_review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ladder_id UUID NOT NULL REFERENCES exposure_ladders(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  flag_type TEXT NOT NULL,
  flag_data JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'dismissed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patient_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL CHECK (
    type IN ('experiment_reminder', 'checkin_prompt', 'practitioner_message')
  ),
  content TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

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

Mobile (Teen)
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
  (when analytics at scale is needed)
```

### Why these choices

**Railway** — operational familiarity from PPF and Mitora. Handles PostgreSQL, Redis, cron jobs, and environment management in one place. Not the cheapest option at scale but the right choice for building speed at this stage.

**Netlify** — same pattern as PPF dashboard. No SSR needed for a fully authenticated application. Vite + React Router is simpler and faster than Next.js for this use case.

**Expo managed workflow** — handles build toolchain, OTA updates, push notifications, and app store submission without requiring direct Xcode/Android Studio management. Eject to bare workflow only if a hard wall is hit — unlikely for Float's requirements.

**Cloudflare R2** — S3-compatible, no egress fees, works well with Railway's ecosystem. Educational content is delivered via signed URLs — never publicly exposed.

---

## 7. API Architecture

RESTful. Action-style endpoints for operations that don't map cleanly to resources (AI review, progress calculations, notification triggers).

### Monorepo structure

```
float/
  apps/
    web/               React — practitioner + parent dashboard
    mobile/            React Native + Expo — teen experience
  packages/
    api-client/        Shared — API calls, auth, React Query hooks, types
    clinical-logic/    Shared — data transforms, progress calculations,
                       ladder validation, display formatting
    ui-tokens/         Shared — colors, typography, spacing
  backend/             FastAPI
  turbo.json
  package.json
```

`api-client` and `clinical-logic` are pure TypeScript — no DOM, no native APIs. They run identically in both web and mobile environments. This is where the meaningful code sharing happens.

### Endpoint groups

```
/auth
  POST  /auth/login
  POST  /auth/logout
  POST  /auth/refresh
  POST  /auth/invite
  POST  /auth/accept-invite
  POST  /auth/reset-password

/organizations
  GET   /organizations/{org_id}
  PUT   /organizations/{org_id}
  GET   /organizations/{org_id}/practitioners
  GET   /organizations/{org_id}/patients
  GET   /organizations/{org_id}/stats

/patients
  GET   /patients
  POST  /patients
  GET   /patients/{patient_id}
  PUT   /patients/{patient_id}
  GET   /patients/{patient_id}/summary       pre-session brief

/treatment-plans
  GET   /patients/{patient_id}/plan
  POST  /patients/{patient_id}/plan
  PUT   /patients/{patient_id}/plan/{plan_id}
  GET   /patients/{patient_id}/plan/{plan_id}/parent-view

/trigger-situations
  GET   /plans/{plan_id}/triggers
  POST  /plans/{plan_id}/triggers
  PUT   /plans/{plan_id}/triggers/{trigger_id}
  DELETE /plans/{plan_id}/triggers/{trigger_id}
  PUT   /plans/{plan_id}/triggers/reorder

/avoidance-behaviors
  GET   /triggers/{trigger_id}/behaviors
  POST  /triggers/{trigger_id}/behaviors
  PUT   /triggers/{trigger_id}/behaviors/{behavior_id}
  DELETE /triggers/{trigger_id}/behaviors/{behavior_id}

/ladders
  GET   /triggers/{trigger_id}/ladder
  POST  /triggers/{trigger_id}/ladder
  PUT   /ladders/{ladder_id}
  POST  /ladders/{ladder_id}/review          trigger AI review
  GET   /ladders/{ladder_id}/flags

/ladder-rungs
  GET   /ladders/{ladder_id}/rungs
  POST  /ladders/{ladder_id}/rungs
  PUT   /ladders/{ladder_id}/rungs/{rung_id}
  PUT   /ladders/{ladder_id}/rungs/reorder

/experiments
  GET   /patients/{patient_id}/experiments
  GET   /rungs/{rung_id}/experiments
  POST  /rungs/{rung_id}/experiments
  GET   /experiments/{experiment_id}
  PUT   /experiments/{experiment_id}/before
  PUT   /experiments/{experiment_id}/after
  PUT   /experiments/{experiment_id}/skip

/accommodation
  GET   /plans/{plan_id}/accommodation
  POST  /plans/{plan_id}/accommodation
  PUT   /accommodation/{behavior_id}
  PUT   /accommodation/{behavior_id}/relinquish

/progress
  GET   /patients/{patient_id}/progress
  GET   /patients/{patient_id}/progress/summary
  GET   /rungs/{rung_id}/progress

/notifications
  GET   /patients/{patient_id}/notifications
  POST  /patients/{patient_id}/notifications
  PUT   /notifications/{notification_id}/dismiss

/content
  GET   /content
  GET   /content/{content_id}
  GET   /content/signed-url/{content_id}
```

### Conventions

**Pagination** — cursor-based on all list endpoints:
```json
{ "data": [...], "cursor": "eyJpZCI6IjEyMyJ9", "has_more": true }
```

**Errors** — consistent shape across all endpoints:
```json
{ "error": { "code": "LADDER_NOT_FOUND", "message": "...", "field": null } }
```

**Timestamps** — all ISO 8601 UTC. Frontend converts to local time for display.

**Org scoping** — `organization_id` derived from session on backend. Never passed by client.

### Middleware stack

```
Request
  → HTTPS enforcement
  → Rate limiting
  → Authentication (validate JWT, load user)
  → Organization scoping (set app.current_org_id for RLS)
  → Role authorization
  → Request logging
  → Handler
  → Response logging
  → Error handling
Response
```

### Background jobs (Railway cron)

- Experiment reminders — scheduled notifications to teens
- Check-in prompts — weekly reminders for parents and patients
- Pre-session brief pre-computation (Phase 2+)

### Notable endpoint design

**Pre-session brief** (`GET /patients/{patient_id}/summary`)  
Computed view assembled from multiple queries: experiments since last session, distress thermometer trend, BIP trend, parent accommodation updates, open ladder flags, current ladder status. Returns a structured summary. Built as a service function, not direct ORM queries. One of the most important endpoints — used before every session.

**Experiment state machine**  
Before and after saves are separate endpoints because they happen at different times. Partial saves are safe and meaningful — a planned experiment that was never completed is still useful data.

**AI ladder review** (`POST /ladders/{ladder_id}/review`)  
Rule engine runs synchronously (fast). Claude API calls run concurrently for all flags (async). Typically one to two seconds total. Returns flags with descriptions. Rules are configuration, not hardcoded — updateable without a code deployment.

---

## 8. Frontend Architecture

### Web dashboard (React)

**Stack:** React 18, TypeScript, React Query, React Router v6, Tailwind CSS, Vite

**Routes:**
```
/login
/invite/:token

# Practitioner
/dashboard                           caseload overview
/patients/:id                        patient overview + pre-session brief
/patients/:id/plan                   treatment plan
/patients/:id/plan/triggers          trigger situations
/patients/:id/plan/ladder/:id        exposure ladder builder
/patients/:id/progress               progress charts
/patients/:id/experiments            experiment history

# Parent
/my-child                            child overview (visibility-scoped)
/my-child/accommodation              accommodation behavior tools
/my-child/progress                   progress summary

# Shared
/content/:id
/settings
```

**Key UI flows:**

*Caseload view* — practitioner home. Patient list with at-a-glance status, last experiment date, flag badges. The practitioner should understand every patient's status without opening individual records.

*Ladder builder* — most complex interaction. Practitioner reviews trigger situations and behaviors, assigns distress thermometer ratings, drags rungs into order, submits for AI review, reviews inline flags, approves. Drag and drop via `@dnd-kit/core`.

*Pre-session brief* — top of the patient view. Computed by API. Structured summary: what happened since last session, trends, parent updates, what to focus on today.

*Progress charts* — BIP trend and distress thermometer trend (predicted vs actual) built with Recharts. Design principle: show the learning, not just the numbers. The gap between predicted and actual distress thermometer is the clinical story.

### Mobile app (React Native + Expo)

**Stack:** React Native, TypeScript, Expo managed workflow, React Query, React Navigation, NativeWind

NativeWind brings Tailwind's utility class system to React Native — same class names as the web app, different rendering under the hood. Reduces context switching when working across both platforms.

**Navigation:**
```
Bottom tabs
  My Plan
    → Ladder detail
    → Rung detail
  Experiment
    → Plan (before state) — one question per screen
    → Commit screen
    → Record results (after state) — one question per screen
    → Completion + learning
  Progress
    → Full history
    → Rung-level detail
```

**Experiment flow — one question per screen**  
The experiment flow is the core teen experience. Each prompt is its own screen — not a form. This reduces friction, keeps teens engaged, and makes clinical data capture feel like a conversation.

Before: What are you going to do? → What's your biggest worry? → How strongly do you believe that? → How confident are you?

After: Did your worried thing happen? → What happened? → How anxious were you? → What did you learn?

Completion screen shows BIP before and after — makes the learning visible.

**Offline behavior**  
Teens run experiments in places without reliable connectivity. The experiment flow works offline. React Query + `@tanstack/query-async-storage-persister` with Expo SecureStore as persistence layer. Before and after states saved locally first, synced to API when connectivity returns. The teen never sees a failed save.

### State management

React Query handles all server state. React `useState` and `useContext` handle local UI state. No Redux or Zustand.

Shared context:
- Current authenticated user and role
- Current organization
- Active patient context (web — which patient the practitioner is viewing)

### Design principles

**Calm and clear over energetic** — not gamified, not anxious-making. Whitespace, clear hierarchy, muted palette with purposeful color use.

**Distress thermometer has a consistent visual language** — a color scale from cool (low distress) to warm (high distress), used consistently across web and mobile. This appears everywhere — ladders, experiments, progress charts.

**Teen experience has its own voice** — warmer, more personal, age-appropriate language and tone, while sharing the same underlying design tokens as the practitioner dashboard.

---

## 9. AI Review System

### Architecture

```
Ladder Review Service
  ├── Rule Engine       deterministic checks, parameters from config
  ├── Flag Generator    Claude API — natural language descriptions only
  └── Flag Store        persisted to ladder_review_flags table
```

Rule engine runs first and produces structured flag objects. Flag generator takes those flags and produces human-readable descriptions via Claude. Clinical safety net does not depend on the language model — if Claude is unavailable, fallback template descriptions are used.

### Rule engine

Rules are JSON configuration — updateable without a code deployment. Dr. Walker's clinical parameters live here:

```json
{
  "ladder_rules": {
    "max_starting_distress_thermometer": 4,
    "min_rungs": 3,
    "max_rung_gap": 2,
    "require_high_confidence_rung": true
  }
}
```

Each rule check returns zero or more structured flag objects with a machine-readable type and the specific values that triggered it.

### Flag types

| Type | Description |
|---|---|
| `STARTING_DISTRESS_TOO_HIGH` | First rung exceeds recommended starting threshold |
| `RUNG_GAP_TOO_LARGE` | Gap between adjacent rungs exceeds recommended maximum |
| `INSUFFICIENT_RUNGS` | Ladder has fewer rungs than recommended minimum |
| `NO_HIGH_CONFIDENCE_RUNG` | No rung the patient rates high confidence for |
| `MISSING_BEHAVIOR_REFERENCE` | Rung has no associated avoidance behavior |

Additional flag types added as Dr. Walker defines more criteria.

### Claude integration

Flag descriptions are generated concurrently for all flags in a single review. Each flag type has a prompt template and a fallback template. 200 token maximum per description. Typically one to two seconds for a full review.

```python
FLAG_FALLBACKS = {
  "STARTING_DISTRESS_TOO_HIGH":
    "The first rung's distress thermometer rating of {actual} exceeds "
    "the recommended maximum of {max_allowed}. Consider breaking this "
    "into sub-situations or adding an imaginal exposure as a first step.",
  ...
}
```

### Future AI hooks (same infrastructure, new prompt templates)

**Pre-session brief synthesis** — natural language summary of experiment results, trends, parent updates, and recommendations assembled from structured data.

**Coaching nudges** — personalized experiment reminders generated from the experiment's before state. "You planned to order your own food at lunch today. Your prediction was that people would stare. Let us know how it went."

Both use the same Claude API integration already in place. No additional infrastructure required.

---

## 10. Build Sequence

Each phase is independently usable — a practitioner can do real clinical work at the end of each phase.

### Phase 1 — Foundation
*Goal: Practitioner can onboard a patient and build a treatment plan*

- Database schema, all core tables, RLS from day one
- Auth — practitioner login, patient invitation
- Single organization, no multi-org complexity yet
- Patients, treatment plans, trigger situations, behaviors, ladder APIs
- AI ladder review — rule engine only, no Claude yet
- Web dashboard: login, caseload, patient setup flow, ladder builder, flag display

### Phase 2 — Teen Experience ← pilot-ready at end of this phase
*Goal: Teen can run experiments between sessions, practitioner can monitor*

- Experiments API — full before/after state
- Progress API — distress thermometer and BIP trends
- Notifications — experiment reminders
- Push notification infrastructure
- Pre-session brief — structured data, no Claude yet
- Mobile app: onboarding, My Plan, experiment flow, progress, push notifications
- Web dashboard additions: experiment history, pre-session brief, practitioner alerts

### Phase 3 — Parent Experience
*Goal: Parents are active participants in the treatment*

- Parent user type, invitation, permissions
- Parent visibility scoping
- Accommodation behaviors API
- Web dashboard: parent experience, accommodation tools, visibility-scoped child view, weekly check-in

### Phase 4 — Educational Content and AI Synthesis
*Goal: Platform teaches as well as guides*

- Content management, R2 storage, signed URLs
- Claude integration — flag descriptions, brief synthesis, coaching nudges
- Content delivery across web and mobile
- Practitioner, parent, and teen psychoeducation content

### Phase 5 — OCD/ERP Track
*Goal: Extend to OCD presentations*

- ERP clinical track selection
- Ritual behavior type surfaces throughout UI
- ERP-specific ladder rules and flag types
- ERP worksheet variants in mobile experiment flow

---

## 11. Open Decisions

Decisions that are pending clinical input from Dr. Walker or product decisions not yet made. This section is updated as decisions are resolved.

| # | Decision | Waiting on | Notes |
|---|---|---|---|
| 1 | Which specific tools from the clinical model are in the platform vs handled verbally in session | Dr. Walker | Affects Phase 1 scope significantly |
| 2 | Is the Downward Arrow a patient-facing tool or practitioner/parent-facilitated | Dr. Walker | Affects whether it's in the teen app or the web dashboard |
| 3 | Specific parameters for ladder review rules | Dr. Walker | Rule engine is built; parameters are configuration |
| 4 | Parent visibility level definitions — exact scope of full/summary/minimal | Dr. Walker | Architecture supports it; content needs definition |
| 5 | Auth approach for younger children — PIN vs passphrase, age threshold | Dr. Walker | Affects mobile onboarding design |
| 6 | OCD/ERP track timing — Phase 5 or earlier | Product decision | Depends on pilot patient population |
| 7 | Parent component requirement for initial pilot — required or additive | Dr. Walker + Product | Affects whether Phase 3 must precede pilot |
| 8 | Distress Thermometer vs SUDS terminology in the platform | Dr. Walker | Both used in books; platform should be consistent |
| 9 | Treatment plan versioning approach — full history or change log | Technical decision | Needs resolution before Phase 1 build |
| 10 | Multi-org support timing — Phase 1 single org or multi-org from start | Product decision | Single org is simpler but migration later has cost |

---

*Float Technical Architecture — Living Document — v0.1 — April 2026*
