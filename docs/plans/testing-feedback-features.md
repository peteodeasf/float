# Testing-feedback features — plan

Seven features from testing feedback, grounded in the current code. Sequenced by risk/size.
**Gates:** items touching fear-rating/avoidance/laddering semantics need **Dr. Walker sign-off**
(non-negotiable #1); items adding columns need a **prod migration** (Railway auto-migrates on deploy);
item 1 touches access/PHI → **`/security-review`**.

Current-state references (from code map):
- Situations: `trigger_situations` — `distress_thermometer_rating: Numeric(3,1)` **single scalar**
  (`backend/app/models/treatment.py:41-66`). Zero-behavior situations can't activate.
- Behaviors: `avoidance_behaviors` — `trigger_situation_id NOT NULL` (**one situation each**),
  `distress_thermometer_when_refraining` scalar, no `parent_behavior_id`, no library
  (`treatment.py:69-92`).
- Plan builder: `treatmentPlanBuilder` (`PatientPage.tsx:2364`), `BehaviorPanel` (`:330`); add
  buttons are tiny `text-[10px]` teal links. `isSimilar` dedup helper at `:88-99` (AI-extraction only).
- Monitoring: parent fills a token page (`MonitorLandingPage.tsx`); **no consent anywhere**.
- Teen invite: `POST /{patient_id}/invite-teen` (`patients.py:384`) — no consent/plan gate.
- Teen empty state: `TeenHomePage.tsx:326-347` — "You have no active experiments yet."

---

## Tier A — quick wins (no migration, ship independently) — ✅ built (branch `tier-a-quick-wins`)

### 3. Bigger, bolder Add-Situation / Add-Behavior buttons
Pure UI. Replace the `text-[10px]` teal text-links (`PatientPage.tsx:2400`, `:557`, empty-state `:2488`)
with prominent buttons (larger text, filled/outlined, `+` icon) so they read as primary actions.
- **Size:** XS. **Gate:** none. **Open:** filled vs outlined (I'll default to outlined-teal, filled on empty state).

### 4. Add avoidance behavior without typing a name
An avoidance behavior is defined by the situation it avoids, so the name is redundant. In the
add-behavior form (`BehaviorPanel` `:760-793`), when `type === 'avoidance'`, make the name optional and
auto-fill **"Avoids {situation name}"** on submit (frontend-only; backend `name` stays required, we
just supply the derived value).
- **Size:** S. **Gate:** light (wording is clinical-adjacent). **Open:** default name text — "Avoids
  {situation}" vs "Avoidance of {situation}".

### 5. Warmer "no active experiment" message (teen app)
Rewrite `TeenHomePage.tsx:329-336` from "You have no active experiments yet. / Your clinician will set
these up…" to something encouraging/forward-looking. Copy-only.
- **Size:** XS. **Gate:** Dr. Walker eye on teen-facing copy (low risk). **Open:** exact copy — I'll
  draft 2–3 options.

---

## Tier B — schema + clinical (each is a migration + Dr. Walker)

### 2. Distress-thermometer **range** at the Situation level
Move situations from a single DT to a **min–max range** (mirrors parent accommodations, which already
range e.g. "6–8"; and the AI-extraction already carries `fear_rating`/`fear_rating_max`).
- **Model/migration:** add `distress_thermometer_min` + `distress_thermometer_max` (Numeric(3,1)),
  backfill existing single value into **both**, keep the old column briefly for rollback (or repurpose
  the existing one as `_max`). Recommend add-two-new + backfill; drop the old later.
- **Frontend:** add-situation form + situation display show a range (two steppers, "min–max").
- **Scope:** **situations only** this item — behaviors stay scalar unless #7 changes them.
- **Size:** M. **Gate:** **Dr. Walker** (fear-rating rules). **Open:** replace the single column vs
  add-alongside; whether "min" is optional (single value still allowed).

### 1. Parental consent to connect the child
Capture explicit parent permission to connect the child into the app; surface it in the clinician
dashboard; **block the teen invite until it's given**.
- **Capture:** a consent step on the **parent-filled monitoring form** (`MonitorLandingPage`) — a
  clear checkbox + statement, recorded with a timestamp. **Recommend also** a clinician-side
  "consent obtained (offline)" action, since consent is often verbal/on-paper in practice.
- **Store:** `patient_profiles.child_connect_consent_at` (timestamp) + `consent_source`
  ('parent_form' | 'clinician'); expose on `PatientResponse` / `PatientListResponse`.
- **Dashboard:** show consent state on the **Parent/Teen access** cards + patient header; the teen
  access card shows "Awaiting parent consent" when absent.
- **Gate the teen invite (hard block):** backend `invite_teen` returns 403 if no consent; frontend
  disables Send-invite with an explainer. This is the enforcement point.
- **Size:** L. **Gates:** **migration**, **`/security-review`** (access/PHI), and **Dr. Walker +
  likely a compliance/consent-language review** — a checkbox may not be legally sufficient for a
  minor; confirm required language/identity before building the capture UI.
- **Open:** consent mechanism (form checkbox only vs + clinician override); exact language (Dr.
  Walker/legal); hard-block vs warn (assume hard block per the ask).

---

## Tier C — the behavior-model reshape (design #6 + #7 together)

**#6 and #7 both restructure how behaviors work and must share one data-model design.** Today a behavior
is a one-off row nailed to exactly one situation with one score. The feedback pushes toward behaviors
as **reusable, hierarchical library entities** applied to many situations.

### 6. Select-from-library **or** enter-new (situations + behaviors) with dedup; behaviors ↔ many situations
- **Library:** new per-org tables — `situation_library` and `behavior_library` (name, type, org).
  On "enter new," create the library entry; thereafter it's selectable. (Scope = **per-org**, for
  clinical/PHI isolation — confirm.)
- **Matching/dedup:** as the clinician types, fuzzy-match (extend the existing `isSimilar`, `:88`)
  against the library and suggest existing entries ("Did you mean 'Eats in the bathroom'?"). Picking
  an existing entry reuses it; confirming "new" adds it. Advisory, not a hard block.
- **Behaviors many-to-many with situations:** replace `avoidance_behaviors.trigger_situation_id`
  (NOT NULL, one situation) with a **join** — a `behavior_library` definition linked to 1..n
  situations, and a **per-(behavior, situation) instance** that carries the **score** (since the same
  behavior can have different DT in different situations). This is the big migration: split
  "definition" (reusable) from "instance" (scored, per situation).
- **Size:** XL. **Gates:** **migration (data reshape)**, **Dr. Walker**. **Open:** library scope
  (per-org vs global); definition/instance split confirmation; migration path for existing behaviors.

### 7. Sub-behaviors (finer, lower-scored steps)
When a behavior's score is too high to work with, add a **more specific sub-behavior** on the same
situation with a **lower score** — i.e., break one rung into smaller rungs.
- **Model:** with the #6 reshape, this is a **`parent_behavior_id`** (self-reference) on the
  behavior-instance, forming a shallow hierarchy per situation. Without #6, it's a `parent_behavior_id`
  on `avoidance_behaviors`.
- **UI:** on a high-scored behavior, "＋ Add a smaller step" → creates a child tied to the same
  situation with its own (lower) score; the ladder renders parent → children.
- **Size:** M (on top of #6). **Gate:** **Dr. Walker** (laddering/exposure logic). **Open:**
  clinician-initiated (recommend) vs auto-suggested when score is high; do children replace or coexist
  with the parent in the exposure ladder.

---

## Recommended sequencing
1. **Ship Tier A now** (#3, #4, #5) — quick wins, no migration, immediate testing value.
2. **#2 (situation DT range)** next — self-contained migration; get Dr. Walker on the range semantics.
3. **#1 (consent)** — parallelizable with #2, but gate on the consent-language decision (Dr.
   Walker/legal) before building the capture UI; enforce the invite block.
4. **Tier C (#6 + #7) last** — one combined data-model design for the behavior library + many-to-many
   + hierarchy; largest migration; needs Dr. Walker on the model and a careful migration of existing
   behaviors. Consider its own sub-plan when we get here.

## Decisions made (2026-08-09)
- **#2 — Single + optional range.** Keep a single DT value as default; allow an optional max to form a
  range. Migration: keep `distress_thermometer_rating` as the single/min, add nullable
  `distress_thermometer_max`. Frontend treats max as optional.
- **#1 — Form checkbox + clinician override.** Parent checks consent on the monitoring form; clinician
  can also record "consent obtained (offline)". Store `child_connect_consent_at` + `consent_source`.
  Consent *language/legal sufficiency* still gated on Dr. Walker/legal before building capture UI.
- **#6 — Global cross-org library**, behaviors reusable across many situations (definition/instance
  split + many-to-many). **⚠ Constraint:** the library stores **only generic situation/behavior
  names + type** (clinical vocabulary), **never** patient-identifying data, scores, or plan links —
  those stay per-patient. `/security-review` this boundary. Cross-org dedup quality matters more at
  global scope (more near-duplicates to reconcile).
- **#7 — Clinician-initiated.** "Add a smaller step" on a high-scored behavior; no auto-prompt.

## Clinical sign-off (Dr. Walker) required before shipping
#1 (consent + gating), #2 (fear-rating range), #6 (behavior model + matching), #7 (laddering). #4/#5
wording is a light touch. #3 is pure UI.
