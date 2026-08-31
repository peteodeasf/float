# The accommodation conversation

**Planned 2026-08-31**, from Peter's reading of chapter 5 of Dr. Walker's book against what Float
already has. Not started.

## What this is

One guided tool in the parent app that does two jobs:

1. **Find the accommodations.** Most parents cannot name them. They experience it as helping.
2. **Rate them.** For each one, the child says how bad it would be if the parent stopped. That
   rating is what orders the plan.

## Scope — what we are NOT building

The book is a self-help guide, written for a parent working alone. Float has a clinician. Several
of its steps are the book teaching a parent to do a clinician's job, and do not need to be
features. Peter, 2026-08-31: *"Not all steps in that process need to be features."*

Left out on purpose:

- **The rehearsal / trial run.** The book has the parent and child act out the trigger situation
  before changing anything. Valuable, and a clinician can run it in session without software.
- **The five troubleshooting questions** as a worksheet. Same reason.
- **Step 4's "decide the next behaviour together".** The clinician sets the focus; that already
  exists.

These are recorded so it is clear they were considered and dropped, not missed.

## The one dimension: parents only, or parents and child

Peter, 2026-08-31: the clinician being present does **not** change the flow.

> *"The design should be that it's essentially the same flow, whether it's done with or without the
> clinician present."*

So the tool has exactly one switch — **Parents only · Parents and child** — and it is a control at
the top of the screen, not a question. A question like "is your child with you?" is phrased for a
parent at home and reads wrong when a clinician is introducing the tool to them.

**It stays visible and can be flipped mid-flow.** The child wanders in; the clinician moves from
talking with the parent to bringing the child in.

**The constraint that follows, and it is the one most likely to be missed:** nothing may be on
screen that becomes wrong when the toggle flips. A parent's list of the things they do that are not
helping must not be sitting there when the child sits down. So the mode decides *which questions
get asked*, and flipping re-renders rather than carrying on.

## Where it lives

**In the parent app.** If the flow is the same either way, there is one of it. When a clinician
runs it in session, they sit with the parent and use the parent's screen.

The clinician side needs two small things: a way to open it, and a way to see what came out.

## The flow

### Parents only — finding the accommodations

Anchored on the child's trigger situations, which the app already has. For each one, the parent is
asked what they do when it comes up. Plain language, one question at a time — the same register as
session mode and the downward arrow, both of which work.

The output is `AccommodationBehavior` rows: what the parent does, and which situation it belongs to.
The model already carries `trigger_situation_id`, and it is already optional, which is right —
some accommodations are not tied to one situation.

### Parents and child — rating them

For each accommodation the child answers the book's question, in their own words:

> How bad would it be for you if I didn't do this?

**A range, not a number.** The book is explicit — Luna answers 2–4, 5–9 — because it varies with
the situation. `distress_min` and `distress_max` already exist on the model.

**These are not the child's exposure ladder ratings.** The book says so twice. Float would then
have three different 1–10 numbers: the situation's, the rung's, and this one. Three numbers on one
scale meaning different things is how a screen becomes confusing, and the wording has to keep them
apart.

The ratings set the order — lowest first, because that is where the plan starts. The clinician can
already reorder by distress (`POST /plans/{plan_id}/accommodations/reseed`), so the ordering
mechanism exists and is currently fed by the clinician's guess instead of the child's answer.

## What already exists

| | |
|---|---|
| `AccommodationBehavior` | name, description, `distress_min`/`distress_max`, `trigger_situation_id` (optional), `display_order`, `status`, `is_weekly_focus`, `accommodator` |
| Clinician side | `ParentPlanPanel.tsx` — create, edit, reorder, reseed by distress, set the weekly focus |
| Endpoints | eight under `/plans/{plan_id}/accommodations`, plus `GET /parent/accommodations` |
| Parent app | reads the accommodations, shows the weekly focus, shows tips for its situation, logs a moment |
| The guided register | `sessionKit.tsx` — the visual language of a one-question-at-a-time screen |

So the plan and the ordering are built. What is missing is the conversation that fills them in.

**One thing that does NOT carry over:** session mode's `SayIt` is words for a clinician to read
aloud. This tool has no clinician role, so it has no equivalent. The screen speaks to whoever is
holding it.

## For Dr. Walker

**A parent listing what they do that is not helping, with their child watching, can land as blame.**
Either the parent feels it, or the child hears "this is your fault". The book manages this with a
warm scripted dialogue and by having the parent open the conversation themselves.

Whatever we build inherits that risk, and it is the kind that goes wrong quietly. Worth her eye on
the wording of the parents-and-child mode before it ships, not after.

Also worth asking: the chapter leans on the child having nicknamed their fear — "Trouble Troll" —
as a shared tool the parent uses too. **Float has no such thing.** The `nickname` field is a name
for the treatment plan. If this tool refers to tools the child already has, those tools need to
exist.

## Order of work

1. **Parents-only mode** — finding the accommodations. It stands alone, it is the half a parent
   cannot do without help, and it needs no decisions about what a child should see.
2. **The toggle**, once there is a second mode for it to switch to.
3. **Parents-and-child mode** — the ratings, after Dr. Walker has looked at the wording.
4. **Clinician side**: open it, and see what came out.

## How to tell it worked

- A parent who has never named an accommodation finishes the parents-only flow with accommodations
  on their plan, attached to the right situations.
- The child's answers arrive as ranges, and the plan orders itself lowest-first from them without
  the clinician reseeding by hand.
- Flipping the toggle mid-flow never leaves a parents-only question on screen.
