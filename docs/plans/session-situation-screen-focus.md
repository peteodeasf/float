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
   to whatever the question is about**: on a scoring screen the behaviour gets the filled block too.
   The rate step uses it as well.
   *(Revised 2026-08-23: the two blocks were first separated by SIZE — the situation shrank to a
   small grey breadcrumb while the behaviour stayed large. That made the context slower to read,
   which is the opposite of the point. They are now separated by **fill** only: same 19px, same
   colour, same accent bar; the subject of the question is the one with the tinted panel.)*
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
| Situation — score | **How hard would it be to be in this situation — without doing that?** / *"{their words}"* |
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

## Coming back in (owner, 2026-08-23)

Session mode was built as a first-run flow, so re-entering it replayed the whole thing: the opening
line to someone who already has a list, then a rating pass over situations that were already rated,
showing each score pre-selected with nothing to do. **The dominant reason to come back is to add one
more situation**, so the flow now scopes itself to what is actually new:

- **No intro on re-entry.** If the plan already has situations, session mode opens on the list.
  "Let's walk through the situations that feel hard" is an opening line, not something to say to
  someone mid-way through.
- **The rating pass covers only unrated situations.** A situation that already has a DT is not
  re-asked.
- **The walk covers only this pass's situations** (`walkIds`), not every situation on the plan —
  so adding one situation walks that one, and "That's everything →" ends the pass.
- **Tapping a situation in the list walks just that one**, then ends on the ladder.
- **Nothing new to do → the ladder.** Confirming the list when everything is already rated goes
  straight to "Here's your whole ladder" rather than marching back through finished work.

**The downward arrow is not offered on a scoring screen.** It is a different conversation, and an
exit offered mid-question is the distraction this flow exists to remove. It stays available on the
other steps.

## The ladder (owner redesign, 2026-08-23)

The end of the conversation. **"Here's your ladder"** / "We'll use this for planning and doing your
exposures."

- **Low at the top, highest at the bottom** — you start at the top with the easiest thing. This
  reverses the previous order.
- **No sentence explaining the ordering.** A colour-graded rail down the left (green → amber → red)
  carries it instead.
- **Each rung expands** to the behaviours captured under it, each with its own score, sorted low to
  high like the rungs themselves. The ladder now shows the actual work rather than a list of
  titles. Behaviours load on expand — usually already cached from the walk, so it's instant for a
  situation just completed.

## The downward arrow (owner, 2026-08-23)

The arrow was the last surface still in the old register — it survived every rewrite untouched,
because it kept getting re-appended verbatim. It carried exactly what we removed everywhere else:
a `WORRY UNDERNEATH · {situation}` eyebrow, the whole chain on screen with no hierarchy, a
`NEXT QUESTION · edit before you ask it aloud` label narrating our own plumbing, three competing
buttons, and a `Type the child's answer…` placeholder addressed to the clinician on a screen the
child is looking at.

**It is no longer inside session mode.** It is its own mode — `ArrowPage`, route
`/patients/:patientId/arrow` — launched from the same header as `▸ Start session`. Two interviews
should sit side by side, not one nested as a detour inside the other. The "Downward arrow ›" link
is gone from the situation screens.

Flow: `intro → pick a situation → follow the chain down → confirm the bottom → next`. The pick list
shows each situation's confirmed feared outcome inline, so completed ones are visible at a glance.

**One deliberate divergence from session mode: the chain stays on screen.** Session mode collapses
its transcript because holding it there is only proving the data landed — but here, watching the
worry descend *is* the therapeutic point (design record, round 4). Same principle, opposite
conclusion: show what the conversation needs and nothing else.

**The AI probe stays confirm-first**, minus the machinery. The suggested question renders *as* the
question — a borderless field styled exactly like the heading — so the clinician clicks and rewords
it before saying it aloud. No panel explaining that they may.

### `sessionKit.tsx`

Both flows now import their register from one module: `Ask`, `Context`, `Exchange`, `SayIt`,
`Chrome`, `DTBadge`, `FearScale` and the shared styles. The arrow drifted precisely because the
patterns lived inside `SessionPage.tsx` and nothing carried them across. The kit is where the rules
are written down in code.

## Still open

1. Owner redline on the copy table.
3. The old hub's "N of M have a fear score" counter is gone with the rewrite — the situation DT is
   now asked in `rate`, so the counter had no meaning. Noted so it isn't reintroduced.
