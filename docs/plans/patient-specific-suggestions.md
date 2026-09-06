# One saved list per patient, and everything is written from it

**Status:** planned, not built. Agreed with Peter 2026-09-05.

## The idea in one sentence

One saved list per patient, built from the patient's own data, that both the report and every
suggestion are written from.

## Why

> We shouldn't suggest anything unless they're based upon the context for the patient.
> — Peter, 2026-09-05

A suggestion may only be written from something this patient's record actually says. If we don't
have that, we show nothing and say why. We do not fill the gap with what children in general do.

This is a change to what a child gets asked to face, so it is clinical. Pre-launch it is Peter's
call, and it is logged in the Dr. Walker review queue.

## The list

One per patient. It holds:

- situations
- child behaviours
- accommodations
- sub-situations (the AI suggestions, once generated)

Each item carries:

- its wording, in the family's own words
- **where it came from** — which monitoring entries, which session notes, or both
- whether a clinician has added it to the treatment plan, and which plan row that is
- whether a clinician has removed it

**Nothing on the list is on the treatment plan.** Peter, 2026-09-05: *"it's not part of the plan
until explicitly added. That's true of situations, behaviors, sub-situations, accommodations, etc."*
A clinician adds an item where that kind of thing lives — a situation in the ladder builder, an
accommodation in the parent panel — and that act records the link back to the evidence.

### Recording the source is not optional

Each item says which monitoring entries and which session notes it came from. Two reasons, both
from Peter, 2026-09-05:

1. The clinician needs to know. "He hides in his room at family gatherings" reads differently
   depending on whether the parent logged it or the clinician wrote it in session.
2. A suggestion has to be traceable to something real. An item that can come from two places has to
   say which.

## What feeds it

**Monitoring data.** Now. Already in the database, already sent to the model by the existing
endpoints.

**Session notes.** Later. A note is one free-text field today; nothing reads it. Peter, 2026-09-05:
*"excluded for now until we implement that extraction, but plan to add later."* When note
extraction exists it updates the same list.

## What reads it

**Analyze with AI →** builds or updates the list, then writes the Preliminary Report & Treatment
Targets from the list — not from the raw log again.

Today the report and the removed trigger-list button were two separate model calls over the same
data, so they could disagree and nobody would see it. After this, Treatment Targets in the report
and the situations offered in the ladder builder are the same list in the same words.

The report stays what it is: prose the clinician reads before the first session, saved on the
patient, editable. It just stops being generated independently. Press the button again as the
parent logs more, and the list updates and the report is rewritten from it — always a picture of
the current list, not a snapshot of one day's log.

**The suggestions** — situations in the ladder builder, sub-situations under a situation,
accommodations in the parent panel — are all written from the list.

## What goes away

**Build trigger list from data →**, and **Extract with AI →** on the Parent monitoring form card,
which is the same thing under a different name. Peter, 2026-09-05: *"Not adding anything at this
point to the plan."*

The code behind it is not deleted — reading the monitoring log and pulling out situations,
behaviours and accommodations is exactly what builds the list. It writes somewhere else.

The line **"Last analyzed … Add new monitoring observations to re-analyze"** is driven by that
button's run and needs rethinking once the list exists.

**Consequence while this is in flight:** until the ladder builder offers situations from the list,
a clinician types every situation by hand. Acceptable pre-launch; it is a real gap for that window.

## What the clinician sees

**The Monitoring tab** holds the list. Peter, 2026-09-05: *"monitoring tab is fine. the function is
initially more about holding the data than it being shown to the clinician, but we will want to
show it."* So: store it properly first, show it well second.

**The Add situation panel in the ladder editor** gets a section above the free-text box:

> **From the monitoring log** — Ordering lunch in the cafeteria (4 entries) · Assembly (2 entries)

Tapping one adds it to the ladder and records the link.

The common-situations list stays underneath. Peter, 2026-09-05: *"It's not clear yet if it's okay
to suggest more general situations there as well. I think it's probably less of an issue than in
sub-situation screen."* Keeping it costs nothing here — a situation picked from that list has no
monitoring entries behind it, so it gets no sub-situation suggestions.

**Sub-situation suggestions** get the entries in the prompt:

```
Situation: Ordering lunch in the cafeteria
The child rates it 7 out of 10.
What they are afraid will happen: Everyone will look at me and think I'm stupid

What has actually happened, from the parent's monitoring log:
  14 Mar — Froze at the counter. Mum ordered for him. Rated 8.
  21 Mar — Wouldn't go in. Ate the packed lunch in the car. Rated 9.
  28 Mar — Went in with his cousin. Ordered himself. Rated 6.
```

**When there is nothing to write from**, the same shape as the downward-arrow gate:

> No monitoring entries mention this situation yet. Suggestions are written from what has actually
> happened, so there is nothing to write from.

Expect this often at first. That is the rule working.

## The prompt rule

One rule added to `step_suggestion_service.SYSTEM_PROMPT`, and it outranks the count:

> Every suggestion must be traceable to something in the information above. If you cannot write
> another one without inventing a detail nobody recorded, stop. Two suggestions grounded in the
> record are better than four with two invented.

## Updating the list

The whole log is analysed every time — that does not change. What changes is that the answer is
folded into the list rather than thrown away, so a clinician's decisions survive: an item they
removed stays removed, an item on the plan keeps its link and gains the new evidence, and genuinely
new items appear.

Matching is on the item's wording, normalised, the way the situation library already works. This
will sometimes miss — with more entries the model may name the same thing differently, and you get
two near-identical items side by side. The blunt answer is to show both and let the clinician remove
one. Worth seeing how often that actually happens on real logs before building anything smarter.

## Sub-situation suggestions: when to generate

Not when a situation is added — a suggestion needs the feared outcome from the downward arrow, which
usually does not exist yet, so the call would be spent hitting the gate.

Generate when the clinician asks, as now, then save the result on the list. Next time the panel
opens, show what is saved rather than calling again. Regenerate when the inputs actually changed:
new evidence linked to that situation, a changed feared outcome, or steps added or removed. Plus a
"suggest again" link.

Three things that buys: no paying to regenerate the same four, suggestions become something you can
look back at, and there is a real corpus to send Dr. Walker instead of one-off screenshots.

## Parent accommodations

Same rule, same list. The raw material is already there — `parent_response` on every monitoring
entry is an accommodation in the parent's own words, with a date and a fear rating beside it, and
the existing extraction already returns accommodations.

We have Dr. Walker's rules for what makes a good exposure step. We have nothing from her on what
makes a good accommodation-reduction step — not one worked example.

**Peter's call, 2026-09-05: build it anyway and show her.** *"Let's put a working feature in front
of her and have her respond to it. I think the initial version is based largely upon the monitoring
data."* Reacting to something real gets a better answer than an open question does.

So the first version:

- is built from the monitoring log, chiefly `parent_response` — what the parent actually did, in
  their own words, with a date and a fear rating beside it
- names accommodations back rather than inventing them, and says which entries each came from
- proposes nothing when the log contains nothing, the same as the exposure suggestions
- carries the same traceability rule in the prompt: every suggestion must come from something
  recorded

**What it must not do until she has ruled on it:** propose the order to stop things in, or a
distress rating for stopping one. Naming an accommodation the parent already described is
repeating them back. Deciding which one a family should give up first is a clinical judgement we
have nothing to base on.

**Then show her the real screen**, with a real ladder on it, and ask what is wrong. Log the round
in the Dr. Walker review queue.

## Make "Analyze with AI" look like a button

Peter, 2026-09-05: *"The 'Analyze with AI' button should actually look like a button, like the
other buttons in the portal. We need to be more consistent in terms of how we represent them."*

Today it is grey text with no border. So are 47 other controls on the patient page — every one
written inline, none sharing a definition. There is no shared button in the clinician app, so each
screen re-invents one and they drift.

Two things, and the second is the one that lasts:

1. Give this button the same treatment as the other real buttons in the portal.
2. Write one shared button and use it. Three kinds is enough: the main action, a second action
   beside it, and a quiet text link for things like Cancel. Once it exists, replace the inline ones
   as each screen is touched rather than in one sweep.

This is not part of the list work and does not block it.

## Order of work

1. The list: table, and the code that builds it from monitoring.
2. **Analyze with AI →** builds the list, then writes the report from it. Remove the trigger-list
   buttons.
3. The Add situation panel offers items from the list; picking one records the link.
4. Sub-situation suggestions read the linked evidence; the gate closes when there is none.
5. Accommodation suggestions, built from monitoring, then shown to Dr. Walker for her
   reaction.
6. Session notes feed the list — after note extraction exists.

Nothing before step 3 changes what a clinician is shown.

## What has to be verified before this ships

- `/security-review`. It touches patient data going to the model and adds a table holding a
  patient's own words.
- Every new query scoped by organization, and the route sweep run.
- A test that a situation with no linked evidence returns the blocked message and never calls the
  model.
