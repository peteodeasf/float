# The exposure ladder is a list of sub-situations

> **Planned 2026-09-01** with Peter. Not started. Supersedes the open questions in
> [`ladder-rung-shape.md`](ladder-rung-shape.md) and finishes phase 3 of
> [`flat-ladder-grouped-situations.md`](flat-ladder-grouped-situations.md).
>
> **Clinical gate:** what counts as a rung is clinical logic (non-negotiable #1). Pre-launch this is
> Peter's call and it is recorded here as his. It goes in the Dr. Walker review queue — it does not
> block the build.

## What changes

A rung stops being **a safety behaviour the child gives up** and becomes **a smaller version of the
situation, with its own fear rating**.

The question that makes a rung changes with it:

| | |
|---|---|
| Today | *"What do you do so it feels safer?"* |
| After | *"What's a smaller version of this?"* |

## Why — Dr. Walker's own data

From her separation-anxiety file, 2026-08-31 (`AI-dev/Ladder Eval/seed/separation-anxiety.md`).
Every rung she wrote is a version of the situation:

> "Be in a different room from the child for: 30 seconds, 1 minute, 2 minutes, 5 minutes"
> "Watch videos of kids getting dropped off at school"
> "Send the child in a carpool"
> "Allow the father to drive if the mother is the preferred safety provider"

None is a behaviour being resisted.

**Safety behaviours are still in her method** — with a different job. One line in the same file:

> "All safety behaviours (special good nights, check-ins, special lights, etc.) need to be stopped
> before doing these exposures"

So they are a condition on doing the exposures, not steps on the ladder.

**What this evidence is:** one clinician, one disorder, a partial file. The structural point above is
in her words rather than inferred from them. How far it generalises is not known from this.

We also already had the problem from the other end. In production a situation with two behaviours
produced a two-rung ladder with both rungs scored 7 — nothing to climb.

## Peter's decisions, 2026-09-01

1. **A rung is a sub-situation with its own fear rating.** Behaviours are not rungs.
2. **Safety behaviours attach to the situation** as a list — *"a bit like metadata"* — to be stopped
   before that situation's exposures.
3. **Situations are groupings, not ladder items.** *"I don't want the UI to be too rigidly
   structured based on those either."*
4. **Each variation is its own specific rung.** "30 seconds" and "1 minute" are two rungs, not one
   rung with a dial. *"Each rung on the ladder will be specific and has to be specified."*
5. **The ladder is chosen, not enumerated.** A few situations, a few rungs each. The therapist is
   not exhaustive. So a ladder is roughly fifteen to twenty rungs, which is fine as one flat list —
   grouping stays a display nicety, not something the UI has to solve.
6. **The conversation becomes the Plan tab's primary view.** The current builder — Ladder and
   Situations — stays, one switch away. *"We hide it from primary view, but it's still available."*
7. **One thing, two presentations.** The conversation is the Plan tab's default view, and a button
   puts it full screen with the clinician chrome stripped for when the child is in the room. Same
   code, same state, no place lost switching. This also covers building the ladder without the
   child, which Peter thinks is rare but possible.
8. **Planning an experiment stays on the Plan tab.**
9. **The downward arrow folds into the conversation** rather than being a second button.
10. **Turning the ladder on for the child is all or nothing.** Per-situation activation goes.
11. **A rung normally belongs to a situation, but it is not enforced.** *"I'm still not sure we want
    to enforce that."* Unchanged from 2026-08-26.
12. **The session flow needs to say where you are.** See below.

## The session flow has no context

Peter, 2026-09-01: *"the current session flow feels like you have no context at all… it's quite hard
to know where you are in the process."*

He is right and it was deliberate — one question per screen, nothing else on it, so the pair look at
the question. It went too far. What the screen carries today is the situation's name, its score, a
count of answers so far, and an Exit button. Nothing says which situation of how many, what stage of
the interview this is, or what is coming.

`Chrome` in `sessionKit.tsx` is an Exit button and nothing else.

**What to add** — orientation, not a form:

- Where you are in the interview: finding situations → rating them → breaking each one down → the
  ladder.
- Which situation this is, out of how many in this pass.
- What the ladder looks like so far, reachable without losing your place.

## What the clinician sees

**Primary view — the conversation.** Opens on the ladder as it stands: the rungs, easiest first, a
situation as a quiet label. From here:

- add a rung to any situation without walking the whole interview
- start a walk when there is new ground to cover
- run the arrow on a situation
- edit a rung — rename, rescore, delete, move. **None of this is possible today**; only a score can
  be reopened.

**Second view — the current builder.** Ladder and Situations as they are. Tags, distress ranges,
regrouping, activation, planning an experiment.

## What the child sees

This changes too, and gets simpler.

| | Today | After |
|---|---|---|
| Setting up an exposure | Pick a situation (only ones marked active), then pick a behaviour under it | Pick a rung off the ladder |
| The exposure screen | "School drop off — **without** asking mum to wait" | "Walk to my classroom by myself" |
| What is available | Whatever is under an active situation | The whole ladder, when the clinician has turned it on |

Peter, 2026-09-01: the child *"generally focus[es] on one situation at a time, but we shouldn't
restrict them to that. They can select to do any exposure at any time."*

`TeenExperimentPage` reads `/patient/behaviors/{id}` and renders the behaviour name as a "without"
sub-line. That sub-line goes.

## Schema — almost nothing

`BEHAVIOR_TYPE_SCENARIO = 'scenario'` already exists and `FlatLadder` already creates rungs with it.
`behavior_type` is a free string column, so a rung that describes a version of the situation needs
no migration. This was built on 2026-08-25 as a step toward exactly this.

So `avoidance_behaviors` ends up holding two different kinds of row — rungs and safety behaviours —
told apart by `behavior_type`. **That column is a known mess**: 11 distinct values across 136 rows
(`safety` / `safety_behavior` / `safety_seeking`, `cognitive` / `anxious_cognition`). It is on the
backlog as a small item and it should be cleaned up *before* this work leans on it, not after.

Per-situation `is_active` on `trigger_situations` stops being read once activation is all or
nothing. Leave the column; stop using it.

**Existing data:** all test data, pre-launch. Existing behaviour rows stay valid rows — they are
sentences with scores. Nothing has to be converted.

## Order of work

1. **Clean up `behavior_type`.** Small, and everything below reads it.
2. **The child's exposure setup** — pick a rung, drop the "without" line, all-or-nothing
   availability. Self-contained, and it is the part a real child would hit first.
3. **Editing a rung in the conversation** — rename, rescore, delete, move. The thing most missing.
4. **"What's a smaller version of this?"** — the new question, replacing behaviour capture as the
   way a rung is made. Safety behaviours still get captured, onto the situation.
5. **Orientation in the session flow.**
6. **Make the conversation the Plan tab's primary view**, with the builder one switch away and a
   full-screen button.
7. **The arrow, inline.**

1 through 5 each stand alone. 6 is the rearrangement and wants the rest to be good first.

## Open

**How does a clinician say "do this one next"?** Peter: the child can do any exposure at any time,
*"it's just not necessarily what the therapist recommends to them."* There is no way to record that
recommendation in the app, and per-situation activation — the closest thing — is going away. Today
it would live in the action plan, which is hidden. Not built, and not specified.

**Which end of the ladder is the top.** The book puts the most feared situation at the top and calls
it the top rung. Ours reads lowest-at-top, per Peter 2026-08-23. Flagged in
[`ladder-rung-shape.md`](ladder-rung-shape.md) and still not revisited.

**Does the conversation still ask what the child does to feel safer?** It must, since safety
behaviours attach to the situation and have to come from somewhere. It just stops being how a rung
is made.

## How to tell it worked

- A clinician builds Dr. Walker's separation-anxiety ladder out of the conversation without touching
  the builder, and the rungs read like her sentences.
- A situation with several safety behaviours produces **no** rungs from them.
- A child opens their app, picks one rung, and does it — with no second choice to make.
- Someone mid-interview can say which situation they are on and how many are left.
- A rung said wrong can be fixed without leaving the conversation.
