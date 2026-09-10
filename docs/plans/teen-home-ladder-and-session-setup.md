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
| Set up with your clinician, no day yet | Dashed outline, "Pick when you'll do it" | Opens the day and time of day only |
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

## Proposed: current experiments live on the Progress tab

Peter, 2026-09-10: *"we need a new place to see current experiment. perhaps we consider adapting
Progress tab?"* With the home as the ladder, a step set up for Friday is only a chip on its row, so
there is no one place listing what the child is working on.

Drawn in the mockups as a proposal, not yet agreed:

- Progress gets two parts. At the top, **what you're working on**: the one due today, anything set
  up for later, and anything the clinician started that is waiting for the child's answers. Below
  it, **how it's going**: what the tab shows today — the fear that didn't happen, the counts, each
  situation's trend.
- The Progress tab carries a dot when something there is waiting.
- The home stays the ladder, for choosing and setting up.

Open: whether the tab keeps the name Progress; whether today's exposure shows on the home as well
as on Progress.

## Two ways to set one up — the same questions, the same result

**At home, by the child.** Tap a step, answer the setup questions the child app already has, and it
shows on the ladder as set up. This is today's flow without the extra card.

**In session, together.** From the clinician's ladder, "Plan it" gets a second choice that opens
the same setup questions full screen, the way the ladder editor already goes full screen for the
child to look at. The child answers; the clinician is beside them and types. When it is finished it
is fully set up — nothing left for the child to do at home.

**Decided: no date-only option in the clinician app.** Peter, 2026-09-10: *"don't like pick a day
as the top level option. it's more likely to be something done by the child."* "Plan it" opens one
button, **Set it up**, alongside the existing "Tell them to do this one next".

**To confirm:** in session the day can be left blank for the child to pick at home. The step then
shows on the child's ladder as set up with the clinician and waiting for a day. This is a reading of
the note above, drawn in the mockups, not yet agreed.

## Decided: in session, the child answers and the clinician types

On 2026-09-01 the plan said the child's predictions — what they think will happen, how anxious they
expect to be, how ready they feel — are theirs, and a clinician should not fill them in.

Peter, 2026-09-10, agreeing to the in-session setup: the child answers out loud and the clinician
types, and those are still the child's answers. *"yes, that's a good description of the scenario.
we may want to enhance how that happens for the therapist/patient in the future."*

So the in-session version is built simply for now, and the way clinician and child share it is
expected to change. Logged in the Dr. Walker review queue.

## Wording — decided 2026-09-10

- "How much do you believe that?" becomes **"How strongly do you believe that will happen?"**
- "Expect to feel?" becomes **"Expect Fear Level?"**
- **Fear Level** is the one name for the 1–10 number. See `CONCEPTS.md`.

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
4. "Plan it" becomes one button, "Set it up", in the clinician app.

Step 1 is useful on its own and can ship first.
