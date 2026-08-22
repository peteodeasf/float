# Session mode — making the situation screen one thing at a time

> **STATUS: direction settled 2026-08-21, not built.** Owner chose **Direction A** (step spine), ruled
> the **overall situation rating off this screen**, replaced the clinical type dropdown with a
> **child-facing two-way choice** ("I avoid this" → `avoidance`, "I do this…" → `safety`), and kept
> the **arrow launchable from the top**. The type mapping is queued for Dr. Walker's confirmation
> before ship (Settled §3). Grounded in
> [`interactive-capture-session-mode.md`](interactive-capture-session-mode.md) rounds 3 and 6.

## Problem

The per-situation screen (`SessionPage.tsx` → `SituationPhase`) presents **five things a person can
act on at once**, to a child sitting next to their clinician:

1. **Downward arrow** — a dark, high-contrast button launching a whole sub-flow, at the very top,
   before the child has answered anything.
2. **Situation fear scale** — ten buttons, 1–10, plus two legend labels.
3. **Add a behavior** — free-text input, *plus* a clinician-only avoidance/safety/ritual dropdown.
4. **Per-behavior fear scale** — another ten buttons on *every* behavior card, with its own prompt
   ("Without doing this, how hard would the situation be?").
5. **Done — back to the list.**

With two behaviors captured, the screen shows **thirty numbered buttons in three strips**. The
dominant visual mass is a scoring grid, which is exactly the "shaped like the database schema"
failure the session-mode work exists to fix. It also breaks the design constraint the flow was built
on: *"one thing at a time, with a non-linear escape hatch."*

### Why this drifted (worth recording — it wasn't a mistake at the time)

Round 3 decided to **merge fear + behaviors into one screen** to cut screen count. That decision was
made when a situation had **one** scoring surface. Round 6 (first prod testing) then added
**per-behavior scoring** — the real ladder-building measurement — which multiplied the scoring
surfaces by the number of behaviors. The density is the interaction of two individually-correct
decisions, so revisiting round 3 is a **re-derivation, not a reversal**.

## Constraint set (from the existing design record)

- One thing at a time; non-linear escape hatch (skip / back / add out of order).
- Kid language up front; **clinician judgments stay off the child-facing surface**.
- Capture ≠ ladder. The ordered ladder stays hidden until the review step.
- Fear rating is a real object, not a number field.
- Target age 10+; warm, low-pressure, clinical-not-decorative.
- Deterministic in v1 — no live model calls in the ladder capture.

## Directions

### A — Step spine inside the situation (recommended)

The situation stays **one place** (one route, one card), but asks **one question at a time**.
Answered steps collapse upward into a compact, tappable summary line, so the child sees progress
without seeing the whole form.

```
SITUATION · Raising my hand in class          overall 7
  ✓ 3 things you do      ← collapsed, tap to reopen
  ── now ──────────────────────────────────────────
  Without asking a friend to answer for you,
  how hard would it be?
      [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ][ 9 ][ 10 ]
  1 · no big deal                     10 · super scary
                                          Skip ·  Next →
```

(The `overall 7` in the header is the pre-existing rating shown as **context**, not a question — it
is set before session mode reaches this screen.)

Steps, in order (**owner decision 2026-08-21: the overall situation rating is not one of them** —
see "Settled" below):

1. **Name what you do** — "What do you do so it feels safer — or so you can skip it?" Naming only:
   free text + (later) seeded chips. **No scores, no type dropdown.**
2. **Score each one** — one behavior per view, one scale: "Without doing this, how hard would it
   be?" Advances through the named behaviors, so the child answers *n* single questions rather than
   facing *n* grids.
3. **The worry underneath** — hands off to the existing `ArrowPhase` (unchanged flow).

Then **Done — back to the list**.

- **Escape hatch:** every collapsed summary is tappable to reopen; `Skip` moves on without an
  answer; the situation can be left at any point (the hub already shows partial state).
- **One visible scale at any moment**, down from up to *n*+1 — and with the overall rating gone,
  every scale on this screen now asks the same question about a different behavior.
- Steps are derived from data, not a wizard the clinician has to complete — reopening the screen
  lands on the first unanswered step.

### B — Progressive disclosure, no stepping

Keep the single scrolling card, but reveal each section only once the one above is answered, and
show per-behavior scoring only after all behaviors are named. Less machinery than A, preserves the
current shape, but at three behaviors the bottom of the screen is still three scoring grids.

### C — Separate screens per question

Split into distinct screens (fear → behaviors → scoring → arrow). Cleanest focus, most Back/Next
taps, and it discards round 3's "merge into one screen" outright rather than reconciling with it.

**Recommendation: A.** It honours round 3's intent (one *place* per situation) while delivering what
round 3 was actually buying (low density), and it degrades gracefully — a situation with one
behavior is barely more stepped than today.

## Settled (owner, 2026-08-21)

- **Direction A.**
- **The overall situation rating comes off this screen.** It is already set before session mode
  reaches the situation — the Plan-tab builder's add-situation form and the monitoring/extraction
  path both write `distress_thermometer_rating` at creation time
  (`PatientPage.tsx:1006`, `:1580`, `:1768`). Asking again here was a duplicate question, and it was
  one of the five competing actions.
  - **Consequence to handle when building:** `HubPhase` currently uses
    `distress_thermometer_rating != null` as its "✓ captured" mark and its "*N* of *M* have a fear
    score" counter. If that value arrives pre-set from the builder, **every situation reads as done
    on arrival** and the counter says nothing. Completion must switch to *"has at least one scored
    behavior."* Cheapest route with no backend change: `useQueries` over the situations calling the
    existing per-trigger `getBehaviors` (there is no bulk endpoint); situation counts are small. If
    that gets slow, add a plan-level behaviors endpoint then, not now.

3. **The clinical type dropdown is replaced by a child-facing two-way choice.** The
   avoidance/safety/ritual `<select>` (on the add row *and* on every behavior card, plus the
   "Clinician-only:" footnote explaining itself to the child) is **too many selections for the
   room**. Instead the child picks between two plain-language options:

   - **"I avoid this"** — the child skips the situation itself. Name defaults to
     `Avoids {situation}`, which is already the builder's behavior
     (`PatientPage.tsx` add-behavior mutation), so the child never has to name anything.
   - **"I do this…"** — a named thing they do so it feels safer.

   **Ritual is not offered** — it sees little use for now. Type stays settable in the Plan-tab
   builder afterwards, so nothing is lost clinically.

   **Mapping (owner, 2026-08-21):** "I avoid this" → `avoidance`; "I do this…" → `safety`.

   > ⚠️ **Confirm with Dr. Walker before ship (non-negotiable #1).** This mapping *is* "what counts
   > as avoidance vs safety" — a clinical decision, not a wording tweak. The owner's call above is
   > the intended behavior; it is built to it, and it goes in the review queue rather than shipping
   > on a UI judgment.

4. **The downward arrow stays launchable from the top** (owner call — the clinician needs to be able
   to go there at any moment, including first). Its density cost is paid down instead by (a) the
   overall-rating step disappearing and (b) the behaviors step no longer rendering *n* scoring grids
   beneath it, so the arrow card is no longer competing with a wall of numbers. Once the arrow is
   complete it keeps collapsing into the existing dark "worry underneath" chip.

## Scope / risk

- Front-end only: `apps/web/src/pages/practitioner/SessionPage.tsx`, `SituationPhase` (and the copy
  in `HubPhase`/`IntroPhase`). **No schema change, no new endpoints** — the same
  `updateTrigger` / `createBehavior` / `updateBehavior` calls, just paced differently.
- **One clinical gate:** the child-facing choice → `behavior_type` mapping above needs Dr. Walker.
  Everything else here changes question *presentation and order*, not what counts as
  avoidance/safety/escape, not fear-rating rules, not plan-commit behavior. Round 5 records the owner
  waiving Dr. Walker gating for session-mode design. The re-ordering (arrow last) is worth telling
  Dr. Walker about at the next review even though it doesn't gate the ship.
- **No PHI/role-boundary change** — same clinician-authenticated surface, same data.

## Still open

1. Whether the child-facing choice is two buttons up front, or one input with an "I just avoid it
   altogether" alternative underneath — a build-time detail, settle it in the mock.
2. Dr. Walker's confirmation of the avoidance/safety mapping (queued, not blocking the build).
