# The child's home is the ladder, and exposures can be set up in session

**Status:** design agreed with Peter 2026-09-10. Not built.

## Why

The ladder is simpler now — one list of steps, easiest first. The home screen still works the old
way: pick a step from the ladder, it appears in a "Set up an experiment" card at the top, then press
"Set it up". Peter, 2026-09-10: *"the selection and showing the item at the top is not necessary.
we should show the ladder and allow them to select from the ladder to set it up. we want to
highlight any exposures that have been set up."*

## The home screen

One list, easiest at the top. Each step is the button.

Each step shows what state it is in:

| State | How it looks | Tapping it |
|---|---|---|
| Not set up | Plain white | Opens setup |
| Your clinician started this | Highlighted, "Finish setting this up" | Opens setup with the clinician's day already in |
| Set up | Mint, with the day and time — "Friday · after school" | Opens the exposure — do it now, or tell me how it went |
| Done | Ticked and quieter | Nothing, or its history |
| Do this next | A small tag on any step not yet done | — |

A step done once but not mastered shows as not set up, with how many times it has been done.

**Goes:** the "Set up an experiment" card, the "Set it up" button, and the separate "Scheduled"
list — the highlighted steps show the same thing.

**Stays:** the "Next experiment" card at the top, but only on the day something is due, so today's
step does not have to be found in the list.

Everything needed is already in `/patient/ladder`: each step's status, and each of its exposures
with its status (`planned`, `committed`, `completed`) and scheduled date.

## Two ways to set one up — the same questions, the same result

**At home, by the child.** Tap a step, answer the setup questions the child app already has, and it
shows on the ladder as set up. This is today's flow without the extra card.

**In session, together.** From the clinician's ladder, "Plan it" gets a second choice that opens
the same setup questions full screen, the way the ladder editor already goes full screen for the
child to look at. The child answers; the clinician is beside them and types. When it is finished it
is fully set up — nothing left for the child to do at home.

The quick date-only "Plan it" stays. On the child's ladder it shows as "Your clinician started this."

## Decided: in session, the child answers and the clinician types

On 2026-09-01 the plan said the child's predictions — what they think will happen, how anxious they
expect to be, how ready they feel — are theirs, and a clinician should not fill them in.

Peter, 2026-09-10, agreeing to the in-session setup: the child answers out loud and the clinician
types, and those are still the child's answers. *"yes, that's a good description of the scenario.
we may want to enhance how that happens for the therapist/patient in the future."*

So the in-session version is built simply for now, and the way clinician and child share it is
expected to change. Logged in the Dr. Walker review queue.

## What has to be checked before building

- **The in-session save.** Today a clinician can only create a `planned` exposure with a date
  (`planExperimentForBehavior`). The child's answers are written by child-only endpoints. The
  in-session setup needs a clinician-side way to save a fully set-up exposure for the child's step,
  scoped to a patient the clinician can open. That is a change to who can write what, so it gets a
  security review.
- **The setup questions as one piece.** They live inside `TeenExperimentPage` today. Showing them in
  the clinician app means pulling them out so both can use them, without changing what the child
  sees.

## Order of work

1. The home screen as the ladder, with the step states. Child app only; no backend change.
2. The setup questions pulled out so they can be shown in two places.
3. The clinician-side save, with tests and a security review.
4. "Plan it" → "Set it up together" in the clinician app.

Step 1 is useful on its own and can ship first.
