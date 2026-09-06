# Suggestions built from the patient's own record

**Status:** planned, not built. Written 2026-09-05 from Peter's direction.

## The rule

> We shouldn't suggest anything unless they're based upon the context for the patient.
> — Peter, 2026-09-05

A suggestion may only be written from something this patient's own record actually says. If we
don't have that, we show nothing and say why. We do not fill the gap with what children in general
do.

This is a change to what a child gets asked to face, so it is clinical. Pre-launch it is Peter's
call and it is logged in the Dr. Walker review queue.

## What counts as the record

**Monitoring data.** In. Already in the database, already sent to the model by the extraction and
preliminary-report endpoints.

**Session notes.** Out for now. A note is one free-text field; nothing reads it and nothing pulls
facts out of it. Peter, 2026-09-05: *"excluded for now until we implement that extraction, but plan
to add later."* The design below keeps a place for them.

## The model: a situation is only real once it is picked

Peter, 2026-09-05: *"the situations of record are the ones that are selected in the ladder builder.
Until then they are just context and suggestions."*

That splits what is currently one thing into two:

- **A situation the extractor found in the monitoring log.** Context. It has a name and the entries
  it came from. It is not on the plan and the child never sees it.
- **A situation on the ladder.** Of record. A clinician picked it in the ladder builder.

Today the extraction's "Add to plan" button creates plan situations directly, which makes situations
of record without anyone picking them in the builder. **Open question for Peter:** should that
button now write candidates only, leaving the ladder builder as the single place a situation
becomes real? Recommended yes — two paths to the same thing is what we just finished removing from
the ladder.

## The link

Nothing today records which monitoring entries a situation came from. The extraction matched names
in the browser and threw the match away. That link is the whole feature, so it gets stored.

New table, `monitoring_situations` — one row per situation the extractor found in a patient's log:

| column | what it holds |
| --- | --- |
| `patient_id`, `organization_id` | scoping, as everywhere else |
| `name` | the situation in the family's own words |
| `entry_ids` | the monitoring entries it was drawn from |
| `trigger_situation_id` | null until a clinician picks it in the ladder builder. **This is the link.** |
| `dismissed_at` | the clinician said it is not relevant |
| `created_at` | |

Picking a candidate in the builder creates the plan situation and sets `trigger_situation_id`. From
then on, "the monitoring entries for this situation" is one join.

A situation somebody typed by hand has no row here, so it has no entries, so it gets no
sub-situation suggestions. That is the rule working, not a gap to patch.

## What the clinician sees

**The Add situation panel in the ladder editor** gets a first section, above the free-text box:

> **From the monitoring log** — Ordering lunch in the cafeteria (4 entries) · Assembly (2 entries)

Tapping one adds it to the ladder and records the link.

The generic common-situations list stays underneath, clearly separated. Peter, 2026-09-05:
*"It's not clear yet if it's okay to suggest more general situations there as well. I think it's
probably less of an issue than in sub-situation screen."* Keeping it costs nothing under this
design — a generic situation still gets no sub-situation suggestions unless entries match it.

**The sub-situation suggestions** get the entries in the block:

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

Expect this often at first.

## The prompt rule

One rule added to `step_suggestion_service.SYSTEM_PROMPT`, and it outranks the count:

> Every suggestion must be traceable to something in the information above. If you cannot write
> another one without inventing a detail nobody recorded, stop. Two suggestions grounded in the
> record are better than four with two invented.

The existing rule about writing two to five stays, but the floor wins over the target.

## Parent accommodations

Same rule, same shape, and the raw material is already there: `parent_response` on every monitoring
entry is an accommodation in the parent's own words, with a date and a fear rating beside it. The
extractor already returns accommodations — the "Add to plan" flow extracts them and drops them.

**Blocked on clinical input, not on code.** We have Dr. Walker's rules for what makes a good
exposure step. We have nothing from her on what makes a good accommodation-reduction step — not one
worked example. Writing that prompt from our own guesses is the exact failure she flagged on the
ladder suggestions.

**Open question for Peter:** wait for her rules, or put a draft in front of her to mark up?

## Order of work

1. `monitoring_situations` table, written when an extraction runs.
2. The Add situation panel shows candidates; picking one records the link.
3. Sub-situation suggestions read the linked entries, and the gate closes when there are none.
4. Accommodation suggestions — after Dr. Walker.
5. Session notes — after note extraction exists.

Steps 1–3 are the feature. Nothing before step 3 changes what anyone is shown, so it can be built
and checked in order.

## What has to be verified before this ships

- `/security-review`. It touches patient data going to the model and adds a table holding a
  patient's own words.
- Every new query scoped by organization, and the route sweep run.
- A test that a situation with no linked entries returns the blocked message and never calls the
  model.
