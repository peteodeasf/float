# Interactive capture — "session mode" for the exposure ladder + downward arrow

> **STATUS: conceptual phase complete 2026-08-19.** Approach, capture flow, downward-arrow design,
> the pipeline seam, and v1 AI scope are all settled with the product owner (decision rounds 1–5
> below). Owner waived Dr. Walker gating for this design. Next: detailed design + implementation
> plan. No implementation yet.

## Problem
The treatment-plan / exposure-ladder builder and the downward-arrow tool are currently
shaped like the **database schema** — fields to fill (situations, behaviors, fear scores).
That was deliberate, but it only serves one of the two real clinical workflows.

Per the clinical advisor, each tool gets completed for a child (ages **8–17**) in one of two ways:
1. **Co-located, interactive** — clinician + child both looking at one screen; either may be
   "driving," but both see the interface. The clinician is **always present**. Current UI does
   this badly: it isn't child-friendly.
2. **Paper-first** — clinician prints a form, completes it with the child on paper, then enters
   the data into the portal afterward (likely for younger kids).

If use case 1 isn't good, clinicians default to printing + uploading — usable, but a weaker
experience. Getting the interactive capture right is what makes this a valuable asset.

## Ratified approach
- **Reframe: model the therapeutic *conversation*, not the schema.** Both tools are guided
  elicitation (a semi-structured interview). Shape the UI like that; let structured data fall
  out the back.
- **Un-conflate two problems.** (A) Making capture child-friendly / conversational-*feeling* is
  an **interaction-design** problem, solvable deterministically with a guided flow — this is what
  fixes use case 1. (B) Whether **AI** drives or assists is a separate, optional layer. **Solve
  (A) first**; layer AI on once the interaction model is proven.
- **One data model, multiple front doors:**
  - **Session mode** (new): guided, warm, low-density, child-facing. Serves use case 1.
  - **Quick-entry mode** (≈ current dense grid): fast transcription. This is the *right* tool for
    use case 2 — keep it, don't discard it.
  - **Printable form**: first-class artifact that mirrors session mode's structure; consider
    closing the loop by photographing the completed form → existing extraction pipeline →
    clinician confirms (instead of re-typing).
- **AI = scribe + scaffold, not interviewer.** The clinician does the talking. AI captures/structures
  spoken or typed input (reuse the intake extraction pipeline), offers age-appropriate rewording,
  breaks the blank page with examples, and (downward arrow) generates the next probe + flags a
  likely core-belief endpoint. **Guardrail:** every AI output is a suggestion the clinician
  accepts/edits — never auto-committed. Keeps the human in the conversation and stays cleanly on
  the right side of the clinical-logic boundary.
- **Voice/dictation** is a promising input for a talking room — prototype it, don't require it.

## Seeding & sequencing (added 2026-08-19)
- **Capture is seeded, not blank.** Situations and behaviors are frequently pre-populated from
  prior work — **monitoring forms**, intake, and the downward arrow. So session mode is mostly
  **review → confirm → refine → prioritize + fill gaps**, not blank-slate elicitation. This
  shrinks the blank-page problem and strongly favors recognition-based, "react to candidates"
  interaction (easier for an anxious child than generating from scratch). Design must handle the
  mix: seeded candidates *and* net-new items, and let the clinician demote/merge/split seeds.
- **Downward arrow ideally precedes the treatment plan.** It runs first; its output — the core
  belief/fear — becomes **context and a seed** for the ladder ("here's the core worry; let's find
  the situations where it shows up"). This gives the ladder emotional coherence (situations read as
  instances of the core fear) and is a genuine **pipeline**: downward arrow → (core fear) → ladder,
  which is itself seeded by monitoring data. Session mode should make that handoff visible.

## Session-mode design considerations
- One thing at a time, with a **non-linear escape hatch** (skip / back / add out of order).
- **Kid language up front; clinician tags underneath** — the child supplies raw content; clinical
  judgments (avoidance vs safety vs ritual; fear calibration) stay clinician-side.
- **Fear thermometer as a real object** (thermometer/faces for younger, slider for teens), not a
  number field.
- **Break the blank page** with age-appropriate examples (recognition > recall for an anxious kid).
- **8 vs 17 is a huge range** — consider a register/reading-level toggle flexing language + visuals.
- **Tone is clinical, not decorative** — emotional safety, normalizing, small wins; engagement *is*
  the therapeutic goal. Connect the built ladder to what the child later sees in the teen app.

## Downward arrow
Near-perfect fit for a guided flow: an inherently **vertical chain** (thought → "if that were
true, what would that mean?" → next rung → … → core belief). The UI can literally *be* a downward
arrow, the chain visibly forming until it hits bedrock. Strong even without AI; AI phrases the next
probe and suggests the endpoint.

## Open decisions (owner)
1. Truly one shared screen, or does the clinician sometimes have a second device?
2. In a co-located session, who's at the keyboard — clinician or child?
3. AI appetite for v1 vs a purely deterministic guided flow.
4. Real-time structuring, or capture-now-structure-after?

Recommendation: build **session mode as a deterministic guided flow first**, keep quick-entry for
the paper path, layer AI in as confirm-first assists once the interaction model is proven.

## Decisions — round 2 (2026-08-19, after reviewing the 3 directions)
- **D2 (living canvas) rejected.** Too structured and too close to what we already have; it forces
  ladder assembly *during* capture, which is the wrong model.
- **Capture ≠ ladder. Capture first; the ladder is a REVIEW step at the end.** Go through *all*
  situations and their behaviors first (warm, guided), then **review the assembled exposure ladder**
  once — that review ≈ the build view we already shipped, now arrived at through the capture flow.
  Do not make the child build the ordered hierarchy live. (This makes D1's "ladder hidden until the
  end" a feature, not a weakness.)
- **Target age: 10-and-up.** Not optimizing for the youngest; the flow can be a bit richer and more
  mature (less baby-emoji), though it must still be warm and low-pressure.
- **Behaviors sub-capture is the hard part.** Per situation, lightweight: kid-language prompt
  ("when X happens, what do you do so it feels safer / so you can skip it?"), seeded behavior chips
  to confirm + add your own; clinician tags type (avoidance/safety/ritual) quietly, off to the side.
- **Downward arrow is designed second.** It runs first *clinically*, but the exposure-ladder capture
  is the harder, higher-priority design; do it first, then apply the winning pattern to the arrow.
- Direction is now a **guided capture flow** (D1-flavored), with conversational/dictation capture
  (D3) available as an optional dial — *not* D2.

## Decisions — round 3 (2026-08-19, after the capture-flow storyboard)
- **Shape confirmed.** Capture-first, ladder-as-review-last is right.
- **Fewer screens: merge fear + behaviors into ONE screen per situation.** The per-situation loop is
  a single detail screen (fear meter + behaviors together), not two steps.
- **Keep the hub.** Frame 1 is a hub (the unordered set of situations) that the pair returns to
  between situations; capture is hub ⇄ situation-detail ↺, then the single ladder review.

## Decisions — round 4 (2026-08-19)
- **"Add your own situation" routes into the same one-screen situation flow** — a net-new situation
  drops into the identical fear + behaviors screen (just no seeded chips; behaviors start empty).
  No separate path.
- **Downward arrow uses the same approach + visual family** as the ladder capture (warm, guided,
  10+, teal card system, clinician driver row). Its natural shape is a **descending chain**: a
  starting (often seeded) thought → repeated warm probe ("if that were true, what would be so bad /
  what would that mean about you?") → each answer drops a step → **core belief (bedrock)**. The
  accumulated chain stays visible (seeing the drill-down *is* the point), unlike the ladder which
  hides until review. AI-optional: suggest when bedrock is reached; clinician confirms.
- **Pipeline closes:** the downward arrow's output (the core belief) **is** the "core worry" context
  chip shown atop the ladder capture. Arrow runs first → produces core belief → seeds/anchors ladder.

## Decisions — round 5 (2026-08-19) — v1 AI scope (settles the conceptual phase)
- **No Dr. Walker gating needed for this design** (owner call). Clinical wording/flow accepted.
- **Exposure-ladder capture is fully deterministic in v1.** No live model calls during the session.
  (Seeding still comes from the existing pre-session extraction pipeline — that's fine; it runs on
  the monitoring form before the session, not live.) Dictation / live "talk → structured card" is
  **deferred** past v1.
- **Downward arrow: integrate AI on the probe phrasing only.** The model phrases the next probe
  naturally, in the child's own words. Stays **confirm-first** — the clinician reads it before saying
  it aloud and can reword. Core-belief "is this the bottom?" detection stays **clinician-driven** in
  v1 (not AI). No other live AI in the arrow for v1.

## Plan
Mock **3 directions** for the exposure-ladder session capture, converge on one (or a merge), then
apply the chosen pattern to downward arrow, then detail + implementation-plan. Each direction
assumes **seeded candidates** (from a monitoring form) and shows the **downward-arrow core fear** as
context at the top, so the pipeline is visible — not a blank-slate mock.
- **D1 — Guided card-by-card wizard.** Seeds become one-per-screen "is this one of yours?" cards to
  confirm/rate; safest, lowest load; big picture (the ladder) hidden until the end. Deterministic.
- **D2 — Living canvas.** Seeds pre-placed as faint rungs the child confirms and rates; the ladder
  assembles itself in front of them; ownership + big-picture always visible; busier.
- **D3 — Conversational transcript that structures itself.** Seeds appear as an opening summary;
  natural-language/dictation parses into confirmable structured cards; most natural for a talking
  room, most AI-dependent.
