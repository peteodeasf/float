# The accommodation conversation

**Planned 2026-08-31**, from Peter's reading of chapter 5 of Dr. Walker's book. **Revised
2026-09-10** with Peter's direction below. Steps 1–3 built 2026-09-10.

## What it does

Two jobs:

1. **Find the accommodations.** Most parents cannot name them. They experience it as helping.
2. **Rate them.** For each one, the child says how hard it would be if the parent stopped. That
   rating orders the plan, lowest first.

## Peter, 2026-09-10

- **Nothing goes straight onto the treatment plan.** What the parent names becomes a suggestion on
  the Parent Accommodations panel, and the clinician adds it. The same rule as every other
  suggestion (docs/plans/patient-specific-suggestions.md).
- **Suggestions come from the monitoring log and from session notes.**
- **Like building the child's exposure ladder:** done in the room with the clinician during a
  parent session, or by the parent at home in the app.
- **Either way, the list goes to the child to rate:** how hard it would be, as a Fear Level.
- **The parent also estimates the child's Fear Level** for each one. The clinician sees both.
  Peter: *"I think that could be interesting."*

## Decided, 2026-09-10 (Peter)

- **The child rates only what the clinician has added to the plan**, never the parent's raw
  suggestions.
- **The child can rate in their own app or in session** with the clinician.
- **The clinician sees the child's ratings and the parent's estimates side by side**, and can choose
  to show the child's ratings to the parent. The child never sees the parent's estimates.

## The flow

### 1. The parent names them — in the room or at home

The same questions in two places, like the exposure set-up built on 2026-09-10:

- **In the room:** the clinician app, full screen, the clinician typing what the parent says.
- **At home:** the parent app, one question per screen.

For each of the child's trigger situations:

1. **What they already told us.** Each accommodation from their monitoring log (and later, their
   session notes) for that situation: *"You wrote that you ___. Do you still do this?"*
2. **Anything else.** *"What else do you do when ___ comes up?"*
3. **Their estimate.** For each one they keep: *"How hard do you think it would be for Sam if you
   stopped?"* A Fear Level, as a range — the book's answers are ranges (2–4, 5–9) because it
   varies with the situation.

What comes out is **suggestions**, not plan rows: the parent's words, the situation, and the
parent's estimate.

### 2. The clinician adds the ones to work on

On the Parent Accommodations panel, with the monitoring-log suggestions that are there today. The
parent's estimate comes across when a suggestion is added.

### 3. The child rates them

The accommodations on the plan go to the child: *how hard would it be if your parent stopped doing
this?* A Fear Level range. The child's rating is what `distress_min`/`distress_max` has always meant
on the model ("the child's distress if the parent stops"); today the clinician guesses it.

### 4. The plan orders itself

Lowest child rating first, through the existing reseed. The clinician can still drag to reorder.
The panel shows the child's rating and the parent's estimate side by side.

## What changes in the data

- **Suggestions** (`patient_insights`, kind `accommodation`) can come from the parent directly, not
  only from monitoring entries, and carry the parent's estimate.
- **`AccommodationBehavior`** gains the parent's estimate (a range) and when the child rated it, so
  the panel can tell a child's rating from a clinician's guess.

## Superseded from the 2026-08-31 plan

**The "Parents only · Parents and child" switch.** It existed because the child was going to rate on
the parent's screen, with the parent's list in front of them. The child now rates separately, so
there is no switch.

## For Dr. Walker

- **The child sees a list of what their parent does.** In their own app now, not over the parent's
  shoulder, but it can still read as blame — the child hearing "this is your fault", or the parent
  feeling it. The wording of the child's screen needs her eye.
- **The child's question.** The book has the parent ask *"How bad would it be for you if I didn't do
  this?"*. In the child's app nobody is asking, so the question has to be reworded.
- **A parent's estimate next to the child's rating.** Useful to the clinician; nobody but the
  clinician should see the two side by side.

## Order of work

1. ~~**Parent-named suggestions and the parent's estimate** — the server side, and the panel showing
   them with the estimate.~~ **Done 2026-09-10.** The security review found that
   `GET /parent/accommodations` sent the whole row, including the child's rating; it now has its
   own reply without it.
2. ~~**The parent app flow** — finding them at home.~~ **Done 2026-09-10.** "What do you do when Sam
   is anxious?" on the parent home. Preview: `/__parent-progress-preview?conversation=1` (dev only).
3. ~~**The clinician app flow** — the same questions, full screen, in a parent session.~~ **Done
   2026-09-10.** "Go through with the parent" on the Parent Accommodations panel. One situation per
   screen; every answer saves as it is given. The parent app and this share one piece of server
   code (`app/services/accommodation_conversation.py`), so the two cannot drift.
4. **The child rates them** — in the child app, and the plan orders by it.
5. **Session notes as a source.** Needs notes to be read for accommodations, which nothing does
   today (docs/plans/patient-specific-suggestions.md, "Session notes. Later."). Its own plan.

## Checks

`/security-review` on 1 and 4: a parent writes suggestions, and a child reads and rates what their
parent does. The parent sees the child's ratings only when the clinician switches that on; the child
never sees the parent's estimates.

## How to tell it worked

- A parent who has never named an accommodation finishes the flow, and the clinician finds their
  suggestions on the panel, each with the parent's estimate and its situation.
- Nothing the parent names reaches the plan until the clinician adds it.
- The child's ratings arrive as ranges, and the plan orders itself lowest first from them.
