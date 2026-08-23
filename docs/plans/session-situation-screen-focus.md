# Session mode — the capture flow as a conversation

> **STATUS: rebuilt 2026-08-22 to Dr. Walker's actual interview order. Built, typechecked, NOT
> deployed.** Supersedes the 2026-08-21 "step spine" version of this plan, which shipped to prod and
> was judged a mess by the owner. Grounded in
> [`interactive-capture-session-mode.md`](interactive-capture-session-mode.md).

## What was wrong

Two failures, one structural and one of register.

**Structural — the order didn't match the interview.** The built flow asked the child to name *all*
their behaviours, then score *all* of them. Dr. Walker doesn't do that. She finishes one behaviour
before starting the next: name it, score it, ask what else. Batching turns a conversation into a
data-entry form with two passes.

It also asked for the situation's overall rating inside the situation screen, when that rating
belongs to the **list** step — asked once per situation while going down the list, before any
per-situation work starts.

**Register — it read as data entry.** Section eyebrows (`SO FAR`, `HOW BIG · 2 OF 5`), progress
counters, `input` + `Add` button pairs, badge columns, `×` delete controls on every row. Each is a
small thing; together they say *fill in this form*, which is the exact failure session mode exists
to fix.

## The flow (Dr. Walker's order)

```
intro
  └─ list       "What do you have trouble with?"        ← starter list to react to + add your own
  └─ rate       "How big does this one feel?"           ← one situation per screen, down the list
  └─ situation  per situation, in turn:
                  "Do you stay away from this if you can?"
                     yes ⇒ an avoidance behaviour, scored AT the situation's own DT
                  "When you're in it, what do you do?"    ← name one
                  "How hard would it be … without that?"  ← score that one
                  "What else do you do?"                  ← loop
  └─ review     the assembled ladder
```

`arrow` (the downward arrow) hangs off a situation and stays reachable at any point — owner call,
2026-08-21.

**Naming and scoring alternate.** This is the load-bearing change: one thing is finished before the
next starts.

## What makes it read as conversation, not a form

1. **The history is out of the screen, not on it.** *(revised 2026-08-22, second pass — the first
   version kept every exchange visible and it crowded the screen all over again.)* A real
   conversation doesn't hold every previous answer in front of you; keeping them there is a
   data-entry instinct — proving the data landed. So the default screen is **situation name + one
   question + one control**, and the record collapses to a single quiet footer line,
   `4 answers so far ›`, that opens on demand. Tapping any line inside it reopens that answer, which
   is why there are no `×` buttons or "score it" links on the child-facing surface: editing is
   *tap what you said*.
2. **The subject of the question gets a block, not a line.** *(2026-08-22, third pass.)* The
   situation was styled as a caption with its score floated to the far right edge, so it read as
   just more text and the number looked unattached. Both now sit together in a tinted block with a
   teal accent bar (`Context`), score inline beside the name at 34px. The **same treatment applies
   to whatever the question is about**: on a scoring screen the behaviour gets the block and the
   situation recedes to a quiet breadcrumb, so "what am I rating?" is answered by the layout. The
   rate step uses it too.
3. **Nothing appears twice.** The item currently being scored is suppressed from the history —
   otherwise the same behaviour showed up as the live question *and* as a stale
   "— we skipped this one" line directly above it.
3. **Questions phrase off the last answer.** After "yes, I skip it", the next question is *"And when
   you can't skip it — what do you do?"*, not the generic opener. That adaptivity is most of what
   makes it feel like someone is listening.
4. **Their words quoted back.** The scoring screen shows `"ask a friend to answer for me"` under the
   question rather than a labelled field — which also disambiguates when an earlier answer is
   reopened.
5. **No counters or section labels.** `HOW BIG · 2 OF 5` became a quiet `3 more after this`;
   `YOURS SO FAR` became `Yours so far — tap one to talk about it`. Sentences, not field labels.
6. **Send, not Add.** The text input submits on Enter with a quiet round `→`. A labelled *Add*
   button beside a field is the universal tell of a form.
7. **Recognition over recall.** The list step offers the shared situation library as a starter list
   (`searchSituationLibrary('')` — the existing endpoint returns the first 20 with no query, so no
   backend change), framed as *"Other kids often say these"*, which normalises as well as prompts.

## Copy

| Where | Line |
|---|---|
| Intro | **Let's map out together the situations that feel hard.** / One thing at a time: what's hard, how big it feels, and what you do about it. Nothing here is set in stone — we can change any of it as we go. |
| List | **What do you have trouble with?** / Tap anything that sounds like you — and add your own. |
| List — yours | Yours so far — tap one to talk about it |
| List — library | Other kids often say these — tap any that fit |
| List — done | That's my list → |
| Rate (first screen only) | Now let's see how big each one feels. |
| Rate | *{situation}* / **How big does this one feel?** · `3 more after this` |
| Situation — avoid | **Do you stay away from this if you can?** → *Yes — I skip it* / *No — I get through it* |
| Situation — name (after yes) | **And when you can't skip it — what do you do?** |
| Situation — name (after no) | **When you're in it, what do you do?** / Anything that makes it easier to get through. |
| Situation — name (later) | **What else do you do?** |
| Situation — score | **How hard would it be to be in it — without doing that?** / *"{their words}"* |
| Situation — score (the avoidance one) | **How hard would it be to be in it at all?** |
| Scale ends | 1 · no big deal … 10 · the worst |
| Situation — done | That's everything → / That's everything — see the ladder → |

## Clinical rules encoded here

Both are Dr. Walker's, relayed by the owner. Recorded because they are scoring logic, not wording,
so non-negotiable #1 applies.

1. **"I stay away from it" is itself the avoidance behaviour**, and its
   `distress_thermometer_when_refraining` **is the situation's own DT** — being in the situation
   without avoiding it just *is* the situation. The record simply reads `7 out of 10` — the
   inference is **not** narrated on screen (owner, 2026-08-22: explaining where the number came from
   is internal logic, and the app should not talk about itself to a child). If the situation has no
   DT yet there is nothing to infer from, so it asks normally instead of guessing.
2. **Behaviour type is derived, never asked** — "I do this…" → `safety`, "I avoid this altogether" →
   `avoidance`. Ritual is not offered in session mode; it stays settable in the Plan-tab builder.

Both are queued for Dr. Walker's confirmation.

## Verification

No non-production database is reachable from a dev machine, so the real route cannot be clicked
through without writing to real patient records.
`apps/web/src/pages/practitioner/__SessionPreview.tsx` renders the phases against seeded
react-query fixtures — no API, no writes — at `/__session-preview`, mounted only when
`import.meta.env.DEV` (verified absent from the production bundle). Every screen above was checked
there.

## Copy revisions (owner, 2026-08-23)

Intro is now **"Let's walk through the situations that feel hard."** / "We'll look at the situations
that feel hard and what happens when you're in them." List is **"What situations do you have trouble
with?"** / "Add your own situations. Or select from common ones.", and the list's own label reads
"Once you add a situation, tap on it to review what happens in that situation." The copy table above
records the earlier wording; these supersede it.

## Still open

1. Owner redline on the copy table.
2. `ReviewPhase` (the ladder) is untouched and still reads like the old build view. It is the last
   beat of the conversation and should probably land differently.
3. The old hub's "N of M have a fear score" counter is gone with the rewrite — the situation DT is
   now asked in `rate`, so the counter had no meaning. Noted so it isn't reintroduced.
