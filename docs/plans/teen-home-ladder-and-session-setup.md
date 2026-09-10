# The child's home is the ladder, and exposures can be set up in session

**Status:** approved to build 2026-09-10 — *"otherwise looks good to build"*. Mockups: https://claude.ai/code/artifact/4f27ea65-0c46-4802-8de3-5693d58615de

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

**Built this way, 2026-09-10:** in session the day can be left blank for the child to pick at home,
and that is where the sheet starts. The step then shows on the child's ladder as set up with the
clinician and waiting for a day. This was drawn in the mockups Peter approved ("otherwise looks good
to build").

## The child's setup is its own design, not the clinician's sheet

Peter, 2026-09-10, after the clinician mockups (*"mockup looks good for clinician"*): *"partial setup
state should show for child and child setup ux should be different than clinician. it should be
more interactive and engaging."*

So the same questions, in the same words, but built differently:

- **One question per screen**, with a bar of five across the top showing how far they are.
- **Things to tap and drag, not boxes to fill.** The fear from the downward arrow is kept with one
  tap, or said their own way. The belief is a slider with a big number that moves with their thumb.
  Fear Level is a thermometer they tap to fill, starting at the step's own Fear Level. The day is a
  row of tiles for the next seven days — several allowed — then morning, afternoon or evening.
  Readiness is three big choices.
- **It ends on a card** that says it's on their ladder, with the day, what they think will happen,
  how sure they are and the Fear Level.

**The partly set up state.** When the clinician set it up in session but left the day, the dashed
step on the child's ladder opens a screen that says so: everything done together is ticked and can
still be changed, the one thing left is the next thing they do, and the bar shows 4 of 5.

**The clinician's version stays one sheet**, because in session it has to be quick.

**Not drawn, on purpose:** word labels on the scales ("pretty sure", "really scary"). Choosing those
words is a clinical wording call.

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
- "Expect to feel?" becomes **"Expected Fear Level?"**
- **Fear Level** is the one name for the 1–10 number, in the child's app and the clinician's. Peter:
  *"not sure Fear Level will be the final term but let's be consistent."* See `CONCEPTS.md`.

Where the clinician app names this number today, found 2026-09-10:

| Where | Says now |
|---|---|
| Ladder editor, the line under the heading (`SessionPage.tsx`) | "Give each one a thermometer score" |
| Ladder editor, adding a step (`SessionPage.tsx`) | "How hard would it be?" |
| Number boxes in the editor and on the Treatment Plan ladder (`sessionKit.tsx`, `SessionPage.tsx`, `FlatLadder.tsx`) | "Thermometer score, 1–10" |
| Parent Accommodations (`ParentPlanPanel.tsx`) | "Distress min" / "Distress max" |
| Monitoring log and report (`PatientPage.tsx`, `MonitoringReportPage.tsx`) | "Fear thermometer", "FT 7" |
| Progress chart (`ProgressPage.tsx`) | "Distress Thermometer" |
| Hidden Situations builder (`BehaviorPanel.tsx`) | "How hard is this version?", "Fear level when refraining" |

**Ask before changing:** the session tips in `PatientPage.tsx` tell the clinician to "Introduce the
Distress Thermometer" and a "Worry Thermometer nickname". Those name the clinical tool the clinician
teaches the child, so renaming them is a clinical wording call, not a label change.

The child app's own wording — "Feels about 8/10" on the home, the setup and record questions — gets
listed when that work is built.

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

Each step ships on its own and leaves the app working.

1. ~~**Fear Level wording**, both apps, and the two renamed setup questions.~~ **Done 2026-09-10**,
   with a Fear Level heading over one lined-up column of boxes on both clinician ladders.
2. ~~**The child's home is the ladder**, with the step states.~~ **Done 2026-09-10.** The "Set up an experiment" card, the
   "Set it up" button and the Scheduled list go. Today's exposure shows at the top only when due.
3. ~~**Progress holds current experiments** at the top,~~ **Done 2026-09-10,** above what it shows today, with a dot on the
   tab when something is waiting.
4. ~~**The child's setup, one question per screen**, including the partly set up state. It must still
   finish today's clinician-planned exposures (a day, no answers) as well as the new kind (answers,
   no day).~~ **Done 2026-09-10.** An older plan that only has a day skips the summary, since
   nothing on it was answered, and keeps its day. Preview: `/__teen-setup-preview/r3` (dev only).
5. ~~**The server side of in-session setup**: a clinician can save the child's answers, with or
   without a day, for a patient they can open. Tests and a security review.~~ **Done 2026-09-10,
   built before step 4** because finishing the new kind needs the child to be able to add the day.
   `POST /behaviors/{id}/session-setup`. The same review closed a hole: the child's
   `/patient/experiments/{id}/before` and `/after` checked the clinic, not the child.
6. ~~**The clinician's Set it up**: "Plan it" becomes one button that opens the setup as one sheet,
   full screen, plus "Tell them to do this one next". The date-only option goes.~~ **Done
   2026-09-10** on the Treatment Plan ladder (`FlatLadder.tsx`, `SessionSetupSheet.tsx`). The hidden
   Situations builder (`BehaviorPanel.tsx`) still has its own date-only plan; it is not shown to
   clinicians today.
