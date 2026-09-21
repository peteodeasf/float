# Parent app, reoriented around the child's work

Peter, 2026-09-21. The parent app stops being "your plan" and becomes "here's what Leo is doing,
and here's your part in it." The situation is the hinge: a child's exposure and a parent's
accommodation both belong to the same `trigger_situations` row, so when the child works a situation,
the parent works their accommodations for that same situation.

> This is expected to change — there's a lot we don't know about how parent accommodation work
> should run. Build it so the pieces are easy to move: keep the situation join, keep the data model
> simple, reshape the UI.

## Decisions (Peter, 2026-09-21)

- **Home = the child's work, brief.** The child's exposure ladder in short form, and what's
  scheduled / coming up. Under each upcoming exposure, that situation's accommodations — **all of
  them, ranked by fear-level range** — as a reminder ("here's what you said you do here"). Each
  accommodation has a **"How did it go?"** free-text note.
- **Only situations with an upcoming exposure show on Home.** Accommodations for situations the
  child isn't currently working on are not shown.
- **The "How did it go?" note replaces the structured parent experiments.** No pre-planned parent
  experiments. The note is **per accommodation**, free text, and the **clinician sees it** (a
  coaching signal). It's clear what it's about because it hangs off the accommodation.
- **Progress tab = a read-only parent's view of the child's progress** (repurpose the existing
  child-progress view), and the **weekly check-in moves here**.
- **The child's ladder / upcoming exposures stay gated by the clinician's share-progress switch.**
  When it's off, Home shows "your clinician hasn't shared Leo's plan yet."
- **Privacy holds.** The parent sees the exposure's name, situation and schedule — never the child's
  private belief/fear numbers or reflections. (Non-negotiable #2.)

## What changes

### Home (`ParentHomePage.tsx`) — rewrite
- Gated on progress sharing (the upcoming-exposures endpoint already returns nothing when off).
- Section: **"What Leo's working on"** — the upcoming/scheduled exposures. For each: what Leo will
  do (rung name) + when. Under it, the accommodations for that exposure's situation (joined by
  `situation_id` == `trigger_situation_id`), ranked by fear-level range, each with a "How did it
  go?" note.
- Remove from Home: the focus-accommodation + weekly check-in (→ Progress), the parent-experiments
  section (→ replaced by notes), "also on your plan" (idle accommodations, now hidden).
- Keep reachable (not on Home's main flow): the accommodation conversation (how the parent tells the
  clinician what they do) and chat.

### Progress (`ParentProgressPage.tsx`)
- Stays the read-only view of the child's ladder/steps and what's done (already gated on sharing).
- **Add the weekly check-in here** ("How did this week go with what you're working on?"), using the
  existing `AccommodationCheckin` endpoints.

### The "How did it go?" note — new
- A small record: accommodation, parent, text, timestamp. New table `accommodation_notes` (parent
  writes; clinician reads). Pre-launch, the migration doesn't need to preserve data.
- Parent endpoints: create + list a note under an accommodation. Clinician: read them on the patient
  page (shown under each accommodation in the Parent Accommodations panel).

### Retire
- Structured parent experiments: `ParentExperimentSetupPage`, `ParentExperimentRecordPage`, the
  `/parent/experiments/*` routes, and the "Your experiments" Home section. The `ParentExperiment`
  backend model/endpoints can be left unused for now or removed later.

## Data / feasibility notes
- Upcoming exposures already return `situation_id`/`situation_name`
  (`GET /parent/child/experiments/upcoming`); accommodations return `trigger_situation_id`
  (`GET /parent/accommodations`). Home joins them client-side — **no new endpoint for the layout.**
- The only new backend is the per-accommodation notes (model + migration + endpoints).

## Build order (stages)
1. Home rewrite (child's work + joined accommodations, notes stubbed to local for review).
2. Notes backend (table, parent endpoints) + wire the note UI to it.
3. Move the weekly check-in to Progress; make Progress the child-progress view.
4. Retire the parent-experiment pages/routes.
5. Clinician-side: show accommodation notes under each accommodation.

## Clinical sign-off (Dr. Walker queue)
This changes how parent accommodation work runs (contextual to the child's exposures; free-text
notes instead of structured experiments; check-in moved). Accommodation logic → note for her.
