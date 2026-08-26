# Flat ladder, situations as grouping

> **STATUS: phases 1 + 2 built 2026-08-25.** Phases 3 (session mode) and 4 (AI) not started. Supersedes the shape question in
> [`ladder-rung-shape.md`](ladder-rung-shape.md). Owner decisions recorded below.

## The inversion

Today the situation is a **folder you must open before you can write anything**: pick a situation,
add behaviours under it, the ladder is those behaviours.

New model: **rungs are primary; a situation is a grouping applied to them.**

- **Rung** — a sentence, one specific DT score, optionally what's being resisted, optionally a
  situation.
- **Situation** — a name, a DT **range**, tags, one downward arrow, and the rungs grouped under it.
  Comes in from monitoring and from parent/patient sessions, often already scored as a range.
- **Ladder** — every rung, flat, ordered by score. Situation is a quiet label on a rung, not a
  level of hierarchy.

The range is why the two scores differ in kind: a situation arrives as "6–8 depending on the day",
a rung is "this exact version, 4".

## What the schema already does

Most of this exists.

| Need | Today |
|---|---|
| Rung = sentence + score | `avoidance_behaviors.name` + `distress_thermometer_when_refraining` |
| Rung grouped by situation | `avoidance_behaviors.trigger_situation_id` |
| Situation DT **range** | `trigger_situations.distress_thermometer_rating` + `..._max` |
| Situation tags | `trigger_situation_tags` → `tags` |
| Situation → one arrow | `downward_arrows.trigger_situation_id`, unique per situation |
| Exposure attaches to a rung | `experiments.avoidance_behavior_id` |

**The one change: `avoidance_behaviors.trigger_situation_id` is `NOT NULL`.** Rungs captured before
they're grouped — especially if AI groups them later — need it nullable. Cheap, additive.

## Grouping: one situation per rung, assigned lazily

Owner: *"almost like a tagging approach… looking for the best way to design this."*

The tagging *feel* — assign late, change freely, leave blank — is about the interaction, not the
cardinality. Recommend **one nullable situation per rung**, because many-to-many costs clarity
exactly where it matters: a rung under two situations has two downward arrows and two tag sets, and
nothing says which one the exposure is testing.

Cross-cutting themes are already served by `content_tags` (Social, Uncertainty…), which is a real
many-to-many and stays as it is.

## Phases

Each ships alone.

### 1. Flat ladder view — BUILT
All rungs for the patient, one list, ordered by score, situation as a quiet label. Add a rung
without choosing a situation first. Smallest change, and it tells us fast whether a flat ladder
actually works in a session.

### 2. Situations view — BUILT (the existing two-pane, now behind a tab)
*"Just needs to see what that looks like."* A situation with its name, DT range, tags, arrow, and
its rungs. Where grouping is managed and where a rung's situation is set or changed.

### 3. Session mode, re-thought
Owner: *"get a list of the situations and the scores, and then, based on the DT scores and some
understanding of the situation, break it down into a smaller sub-situation, ideally with a lower DT
score."*

This is Dr. Walker's Step 2. The flow becomes:

```
the situations and their scores            ← from monitoring, parent + patient sessions
  pick one  (say Baseball practice, 6–8)
    "what's a smaller version of this?"    → a rung, with its own score
    aiming LOWER than the situation, until there's one the child will actually attempt
```

The current walk — *"what do you do so it feels safer?"* — doesn't go away; it's how you find what
to resist. But it stops being the only way a rung gets made. **Biggest UI change of the four.**

### 4. AI
Two distinct jobs, and they want real rungs to exist first:
- **Break down** — given a situation and its score, propose smaller versions along the dimensions
  the book uses (who's there, how many, how long, with/without the behaviour).
- **Group** — given loose rungs, propose clusters and name them.

Both confirm-first, as with the arrow probe: the clinician sees the suggestion and edits before it
counts.

## Settled (owner, 2026-08-26)

1. **An exposure can be planned against an ungrouped rung** — *"keep it flex for now."* No guard.
   Note that such a rung has no feared outcome to test, since the arrow lives on the situation; that
   is accepted rather than prevented.
2. **No DT ranges on the ladder.** The ladder shows the rung's own single score only. The range
   belongs to the situation and stays in the situations view.
3. **The teen app is TBD** — it needs its own redesign, so the question of whether its home screen
   goes flat is deferred rather than answered. Until then it keeps reading situations → behaviours
   through the existing per-trigger routes, which are untouched.

## Still to do

- **The flat ladder has no "Plan an experiment" action yet.** It exists only in the situations view
  (`BehaviorPanel`). Given (1), it should be available from the ladder — that is where the rungs
  now live.
- Phase 3 (session mode) and phase 4 (AI).
