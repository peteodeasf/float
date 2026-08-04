# Concepts — Float vocabulary

Shared terms so they mean the same thing in every plan, review, and session. Clinical
definitions are **Dr. Walker's** to set — the notes below describe how a term is used in
this codebase, not a clinical authority. Correct and extend as the model evolves.

> Seeded starter. Add terms as they come up; prune anything that goes stale.

## Treatment model

- **Exposure** — deliberately facing a feared situation, the core therapeutic action.
- **Accommodation** — ways a caregiver (or the environment) enables avoidance and
  short-circuits exposure (reassurance, doing the feared thing for the child, etc.).
  Reducing accommodation is a primary lever alongside exposure.
- **Fear rating** — the numeric distress level attached to a situation (used to build and
  sequence exposures). Ratings must come from the source, never be invented.

## Behavior types (monitoring extraction)

Behaviors observed in a monitoring note are classified into a small fixed set. Two of
these have open clinical questions — check `STRATEGY.md`/Dr. Walker before relying on them:

- **avoidance** — not entering / staying away from the feared situation.
- **safety** — safety behaviors used to get through a situation (companion, reassurance,
  and, per Dr. Walker's broadened definition, things like somatic complaints, coercion).
- **escape** — leaving a situation early. *Open: whether escape is its own plan type or
  maps to avoidance — controlled by a single seam in the commit flow; pending sign-off.*
- **unclear** — can't be classified confidently; **never** auto-commits to a plan.

Distress itself is **not** a behavior type — it's the fear rating, not a category.

## Product surfaces

- **The three experiences** — parent, child, clinician; distinct products on a shared spine.
  **Terminology:** "child" is the canonical product/clinical term. The codebase still uses
  **"teen"** as a legacy alias (`teen-tokens.css`, `teen-*` classes, "teen experience") —
  treat it as the same role until/unless a rename happens.
- **Monitoring extraction** — turning a family's free-text monitoring note into structured
  situations/behaviors/accommodations/ratings. Output is an **editable preliminary draft**
  a clinician confirms in-session; not persisted as truth until committed.
- **JIT ("just-in-time") tips** — in-the-moment, context-triggered guidance surfaced to
  the user rather than buried in a library.
- **Plan** — the treatment plan built from confirmed situations/behaviors; what the family
  actually works through.

_(add: child home/exposure screens, clinician case-file & sessions IA, parent log-a-moment, etc.)_
