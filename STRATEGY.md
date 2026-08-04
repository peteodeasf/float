# Float — Strategy

> Starting draft, assembled from working context. Treat it as a living document —
> correct and extend it; every plan reads this first, so keep it true.

## What Float is

Float is a clinical tool for treating child/adolescent anxiety using evidence-based CBT:
**exposure** (facing feared situations) paired with **reducing family accommodation**
(the ways caregivers inadvertently enable avoidance). It operationalizes a clinician's
treatment model into software the whole family uses between sessions.

## Who it serves — three experiences

- **Teen** — does the work: exposures, in-the-moment support, logging outcomes, tracking
  progress. The experience has to feel safe and low-friction, not clinical or homework-y.
- **Parent** — reduces accommodation and supports the teen without taking over; logs
  moments, gets tips.
- **Clinician** (e.g. Dr. Walker) — designs and supervises treatment: reviews logs, runs
  sessions, manages the plan. The source of clinical truth.

These are distinct products sharing a spine, not one UI with role flags. Data separation
between them is a hard boundary (see non-negotiables).

## Operating principles

- **Clinician-led, not algorithm-led.** The software encodes a clinician's judgment; it
  does not replace it. Clinical logic changes require sign-off.
- **Between-session leverage.** The value is what happens on the days the family isn't in
  the therapist's office — timely, in-context support.
- **Low friction for the teen.** Adherence dies on friction. Favor fewer steps, plain
  language, and reducing anxiety about using the app itself.
- **Preliminary until validated.** AI-assisted features (e.g. extraction) are editable
  drafts a clinician confirms — never auto-committed clinical decisions.

## Non-negotiables (also in CLAUDE.md)

1. Clinical logic ships only with clinician sign-off.
2. Parent / teen / clinician data separation is a hard security boundary.
3. Local `.env` → production Postgres; Railway auto-migrates on deploy. Migrations and
   pushes are production-affecting.

## Current priorities

<!-- Keep this short and current; detailed status lives in plans and personal memory. -->
- _(fill in: the 2–3 things that matter most right now)_

## Explicitly out of scope / deferred

- _(fill in: e.g. things intentionally not being built yet, so plans don't re-litigate them)_
