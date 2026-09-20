# Parent Accommodations, working like the exposure ladder

Peter, 2026-09-13: the Parent Accommodations panel is "so confusing". It was meant to work like the
child's exposure ladder. **Built 2026-09-13**, with the decisions below.

## How the exposure ladder works (what this copies)

- **The Plan tab shows the ladder**: one list, easiest first, and a **Build ladder** button.
- **Build ladder** turns the same place into the editor, with **← Back to the ladder** and
  **Full screen** (for when the child is looking).
- In the editor: the list, **+ Add situation**, which opens a panel holding **Suggestions from
  monitoring** (tap one to add it, × to take it off the list) and a box to type one. **Done
  adding**, then **Save ladder** takes you back to the ladder.

## What changes

**The panel, normally (the plan):**
- The accommodations, **always in Fear Level order, easiest first**, like the ladder. Ones with no
  Fear Level go last. The drag handle and up/down arrows go, and so does **Sort by Fear Level**.
- Each row: the accommodation, its situation, the Fear Level (and whether the child rated it), what
  the parent thinks, where the parent has got to (a label, not a dropdown), ★ Focus, and **Plan it**.
- **Plan it** opens one small panel: *Not started / Working on it / Stopped* (decision 4 below).
- **Build plan** (top right).

**After Build plan (editing):**
- **← Back to the plan** and **Full screen** (for when the parent or child is looking).
- The same list, where the Fear Level can be changed and an accommodation removed.
- **+ Add accommodation** opens a panel with **Suggestions from monitoring** and a box to type one.
  **Done adding.**
- **Ask the parent** (the parent's questions, full screen) and **Child ratings** (the child rates
  each accommodation with you, full screen; was "Rate together in session").
- **Save plan** goes back to the plan.

**Moved to the Experiments tab**, in a Parent card: **The parent's experiments** (and **Set one up
with the parent**) and **Weekly check-ins**. Both are the parent's progress, not the plan.

## What "Send to the child's app" does today

It marks every accommodation the child hasn't rated as sent. Nothing tells the child. The next time
they open their app, the Progress tab has a row: "Your parent sometimes helps when you feel anxious —
Tell us how hard it would be if they stopped." Tapping it shows each accommodation, in the parent's
words, one per screen, with a Fear Level range. When they finish, their numbers replace yours and the
row says "rated by the child".

The problems: no notice, no clinician there when a child reads a list of what their parent does for
them, and the list uses the parent's own wording.

## Decided, 2026-09-13 (Peter)

1. **Send to the child's app goes.** The child rates only in session, with the clinician. The child's
   app screen for it goes too.
2. **The parent's questions stay for now**, as an **Ask the parent** button while editing.
3. **Suggestions from monitoring** keeps what the parent named in their own app, marked "from the
   parent's app".

4. **Focus and state merge** into one setting in Plan it: **Not started / Working on it / Stopped**.
   Working on it does what the weekly focus did: the parent's home card and weekly check-in, the
   Sunday reminder, the missed check-in flag, first in the parent's experiment list. More than one
   can be Working on it. Stored as the existing `started` value; `is_weekly_focus` stops being read.
   Existing rows marked started but not the focus become Working on it (test data only, pre-launch).

## Checks

Removed routes: `POST /plans/{id}/accommodations/ask-child`, `GET /patient/accommodations-to-rate`,
`PUT /patient/accommodations/{id}/rating`, and the patient list's "Rated the accommodations" reason.
`is_weekly_focus` and `child_rating_requested_at` stay in the database, unread. Not changed: the
reorder and re-sort routes remain on the server, unused by the clinician app.
`/security-review` for the removed child routes and the focus merge.

## 2026-09-20 — group by situation, drop the conversation

Peter: the accommodation flow is still confusing. Make it work and look like the child's ladder
builder — situations with their accommodations under them, not a flat list plus a separate
"ask the parent" stepper.

Decisions (confirmed with Peter):
- **Situations stay unified.** A ladder situation and an accommodation situation are the same
  `trigger_situations` rows. Situations are added/confirmed on the ladder; they appear here
  automatically. No separate add-situation and no confirm here.
- **Group the plan by situation.** Each situation is a section; its accommodations sit under it,
  easiest first. Accommodations with no situation go in an "Other" section so none are lost.
- **Add accommodations inline under each situation** (like the ladder's "Add step"). Difficulty is
  a **required 1–10** on add (stored as `distress_min == distress_max`).
- **Drop the "Ask the parent · type what they say" conversation** (`ParentConversationSheet`) from
  the therapist portal, and the "Do they still do this? Yes / Not any more" question — you only add
  what the parent actually does. The parent app's own accommodation conversation is unchanged.
- **Keep suggest-then-promote.** Monitoring-mined accommodations still show as "Suggestions from
  monitoring" chips; tapping one promotes it onto the plan (lands under its situation). Kept as one
  area, not per-situation, to avoid a backend change.
- **Keep** the per-accommodation status ("Working on it" = the parent's weekly focus) and Child
  ratings.

Clinical note (Dr. Walker queue): accommodation capture changed — dropped "do they still do this",
therapist sets the 1–10 difficulty directly. Pre-launch, Peter's call.
