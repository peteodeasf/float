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
13. **The clinician picks a recommended rung, and the child sees which one it is.** One at a time.
    Advice, not a lock — the child can still do any rung on the ladder.
14. **Setting up an exposure is shared work.** The clinician starts it in session with the child;
    the child can also set one up on their own at home. See below.
15. **Lowest fear rating at the top, and they pick off the top.** Working assumption, unchanged from
    2026-08-23. Peter, 2026-09-01: *"Possibly change that in the future, but that's the working
    assumption."* This closes the open question that was carried in
    [`ladder-rung-shape.md`](ladder-rung-shape.md).

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

## Setting up an exposure — started in session, finished at home

Both halves exist today and they do not meet.

| | What it collects |
|---|---|
| **Clinician** — "Plan an experiment" in the situations pane | what they'll do, a date, how confident |
| **Child** — `TeenExperimentPage` | what they'll do, **what they think will happen**, **how anxious they expect to be**, how ready they feel, which days |

**And an experiment the clinician plans never reaches the child.** The clinician's version is
created with `status="planned"` (`experiment_service.py:67`). The child's home fetches `planned` and
`committed` from `/patient/experiments/pending` — and then renders only `committed`
(`TeenHomePage.tsx:156`). So it is fetched and dropped. A clinician planning an exposure in session
today produces a row the child never sees.

That has to be fixed for any of this to work, and it is small.

**The split that follows from what each side knows:**

- **In session, together** — which rung, when, roughly what they'll do. What the clinician's form
  already collects.
- **At home, the child** — what they think will happen, how anxious they expect to be, how ready
  they feel. These are the child's own answers and a clinician should not be filling them in.

So a clinician-started exposure arrives in the child's app as something waiting for them to finish,
not as something already decided for them. A child starting from scratch answers both halves.

## What the child sees

This changes too, and gets simpler.

| | Today | After |
|---|---|---|
| Setting up an exposure | Pick a situation (only ones marked active), then pick a behaviour under it | Pick a rung off the ladder |
| The exposure screen | "School drop off — **without** asking mum to wait" | "Walk to my classroom by myself" |
| What is available | Whatever is under an active situation | The whole ladder, when the clinician has turned it on |
| What to do next | Nothing says | The rung the clinician recommended is marked |

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

0. **A clinician-planned exposure reaches the child.** **BUILT 2026-09-01.** The child's home has a
   "From your clinician" section above the schedule; tapping one opens the setup screen with the
   rung and the day already set, and finishing it converts that row rather than creating a second.
   The clinician sets the day, the child picks the time of day and answers their own four
   questions. Frontend only — the child's own flow was already create → before → commit, so a
   clinician-planned row just skips the create.
1. **Clean up `behavior_type`.** **BUILT 2026-09-01.** Production held 11 values across 136 rows.
   Three were spellings of "safety". Six were not behaviours at all — nine rows out of monitoring
   extraction ("Complained of stomach pain", "Expressed fear of peer ridicule") that were appearing
   as rungs on a clinician's ladder. Those become `observation` and the ladder stops returning them;
   nothing is deleted. New writes are checked against the canonical five and an unknown value is
   refused rather than quietly hidden. Canonical set in `backend/app/core/behavior_types.py`.

   Worth knowing: only **one** place in the whole codebase branches on this column — a coloured
   three-letter chip in the situations pane. It now also decides whether a row is on the ladder,
   which is the first thing it has ever gated.
2. **The child's exposure setup** — **BUILT 2026-09-01.** `/patient/ladder` now returns a flat
   `rungs` list, easiest first, each carrying its situation as a label and whether it is the
   recommended one. The child's home reads that instead of picking a situation and then a behaviour
   inside it; the situation chips are gone. "without X" is gone from the home, the exposure screen,
   the setup screen and the record screen. Two new columns on the plan: `ladder_active` (all or
   nothing) and `recommended_rung_id`. The clinician gets an On/Off switch and a "Set next" per rung
   on the flat ladder.

   **The ladder is sub-situations only.** Peter, 2026-09-01: *"i really don't care about historical
   data. i'd rather things be clean than confusing."* So `LADDER_TYPES` is `{scenario}` — a safety
   behaviour is a thing to stop before the exposures, an avoidance is what the situation IS, and
   neither is a step to climb. **This empties every ladder built under the old model**: 32 of the
   136 rows are safety, 94 are avoidance, and exactly one is a scenario. Nothing is deleted, and
   the clinician still sees those rows against their situation in the Situations view.

   `situations` is still returned because the progress screens derive from it; it goes when they
   move over.

   **Turning the ladder off now says so.** *"Your steps are turned off right now… Anything you had
   planned is on hold, not gone. Message them if you're not sure why."* The old empty state — "you're
   just getting started" — was a lie to a child who had agreed to do something on Friday.

   **And the switch is the only gate on committed work.** It used to be per-situation membership,
   which broke the moment a rung stopped being a behaviour: work the child had already committed to
   vanished because its step was not on the new-model ladder. What they agreed to do does not depend
   on how its step is typed.

   **Open:** nothing stops a clinician marking a finished step as the next one. The child's screen
   does not show the suggestion on a finished step, so it silently does nothing.

   **Also open:** the Situations view still reads "What to face, and what to resist", which is
   old-model wording. Steps 4 and 7.
3. **Editing a rung in the conversation** — **BUILT 2026-09-01.** Two places, because there are two
   moments.

   **In the transcript, mid-walk.** Every answer now carries *reword* and *×*. A child says
   something and then says it better, and it can be fixed while the question is still on screen.
   Before this, only a score could be reopened.

   **On the review ladder.** Each rung edits in place: click the wording to change it, the score
   badge to re-pick it, a dropdown to move it to another situation or none, and × to take it off.

   Also fixed while doing it: monitoring observations were being listed as answers to *"what do you
   do so it feels safer?"* — "Complained of stomach pain" is not an answer to that, and showing it
   as one puts words in the child's mouth.
4. **"What's a smaller version of this?"** — **BUILT 2026-09-01**, and brought forward. Step 1 made
   the ladder `scenario`-only, and session mode only ever created `avoidance` and `safety` — so a
   clinician could run the entire interview and end with an empty ladder. That made this urgent
   rather than fourth.

   The interview per situation is now: **do you stay away from it?** (context, not a step) →
   **what's a smaller version of this you could do?** (this makes a rung) → **how hard would that
   one be?** → loop → **what do you do so it feels safer?** (a list on the situation, asked last so
   it is not mistaken for the ladder).

   The review screen at the end used to list the situations and expand each to its behaviours. It
   shows the actual ladder now — the rungs, flat, easiest first, with the situation as a label.
5. **Orientation in the session flow.** **BUILT 2026-09-01.** A strip under the exit button:
   **Situations · Scores · Steps · Ladder** with the current stage marked, "2 of 5" while walking
   situations, and "Ladder so far (N)" which opens the ladder without losing your place.
6. **Starting an exposure in session and finishing it at home.** **BUILT 2026-09-01.** Every rung
   on the review ladder has **Plan it**: pick the day, agree it with the child in front of you, and
   it lands in their app as something waiting for them to finish. The clinician sets which rung and
   which day; the child answers their own questions at home.
7. **The conversation is the Plan tab's primary view.** **BUILT 2026-09-01.** The interview was
   extracted from the full-screen route into `SessionInterview`, which both the route and the Plan
   tab render — same component, same state, so the **Full screen** button is a change of
   presentation rather than a different screen. The tab opens on **Conversation**; **Ladder** and
   **Situations** are one switch away, kept rather than hidden.
8. **The arrow, inline.** **BUILT 2026-09-01.** `↓ Downward arrow` now sits on the situation being
   discussed inside the conversation, and opens straight into that situation's chain —
   `/arrow?situation=<id>` — instead of asking the pair to pick it again from a list they just came
   from. The separate button on the Plan tab header is gone: the arrow belongs to a situation, and
   the situation is where you are when you decide you want it.

## Reshaped after Peter tested it, 2026-09-01

> *"it's so confusing as a ui."*

Three tabs — Conversation, Ladder, Situations — put two views of the same ladder side by side and a
builder nobody wanted behind a third. What it is now:

- **The Plan tab IS the ladder.** No tabs. One list, easiest first.
- **The conversation hangs off it**, opened with **Build it with them** and closed with **← Back to
  the ladder**. Not a peer view that is always on screen.
- **The conversation has no ladder of its own.** Its review screen is gone; finishing hands the
  pair back to the one ladder. The orientation strip is three stages now — Situations, Scores,
  Steps — because the ladder is where the conversation ends up, not a step inside it.
- **Everything the review ladder could do, the ladder does**: rename in place, rescore, regroup,
  remove, mark as next, and **Plan it**.
- **The two-pane Situations builder is hidden.** `false &&` on its markup rather than deleted — the
  arrow, the tags and per-situation editing live there and some of it has no replacement yet.
- **Full screen** moved out of the tab header and onto the conversation, which is the only thing it
  applies to.

## The setup flow, rebuilt after Peter tested it again — 2026-09-01

One question per screen was the wrong shape. *"it's conversational but it doesn't have one line per
screen."*

**Three screens, and a beat:**

1. **Situations** — pick them AND score them, on one screen. Was two screens: add the list, then
   score them one per screen.
2. **Steps** — one situation at a time, all of its rungs on one screen, each with its own score,
   accumulating in front of the pair as they are said.
3. **The ladder** — *"3 steps from 'Talking to people' are on your ladder"*, with the new ones
   marked, so it is obvious where the answers went. Then the next situation.

**"Thermometer score", not "how big does this feel."** Peter: the distress thermometer is a concept
they learn outside the app, so the app can name it.

**The behaviour questions are out of setup for now.** Peter: *"take it out for now. we will decide
later how to integrate. We do want to associate behaviors with situations, but I want to get the
ladder creation flow right first before we try to complicate anything."* Existing behaviour rows are
untouched; the flow simply stops asking.

**Still open from this round:** adding a rung and setting up are the same thing, and there are still
two ways to do it — **+ Add rung** on the ladder and **Build ladder**. Peter raised it; not yet
resolved.

**All eight built 2026-09-01.** 0 through 6 each stood alone; 7 was the rearrangement and came
after the rest were good.

## Open

**Where the recommended rung is stored.** It needs somewhere to live and there is nothing today.
Suggested shape: a nullable `recommended_rung_id` on `treatment_plans`, which gives "one at a time"
by construction and is a small additive migration. Not yet agreed.

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
- A clinician plans an exposure in session and the child opens their app and sees it waiting.
- The child can tell which rung their clinician recommended, and can still choose a different one.
