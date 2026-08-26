# What is a rung?

> **STATUS: D built and shipped 2026-08-25** (clinician builder). Session mode still asks only the
> behaviour question — see Open. Re-opens round 6 of
> [`interactive-capture-session-mode.md`](interactive-capture-session-mode.md) (rungs = behaviors).
> Prompted by Dr. Walker's chapter 8 and by the Baseball practice ladder coming out as two rungs
> both scored 7.

## The book's ladder

Every line is **a sentence and a number**:

```
Seeing a post and reading comments together with Diane and other friends   7
Seeing lots of Diane's posts and reading comments together with Diane      6
Seeing three of Diane's posts and reading comments when I'm home by myself 5
Seeing three of Diane's posts when I'm home by myself                      4
Seeing one of Diane's posts and reading comments when I'm home by myself   3
Seeing one of Diane's posts when I'm home by myself                        2
```

Four dimensions are tangled into each sentence — who's present, how many posts, comments or not,
and that she isn't avoiding. Quinn didn't fill in four fields; she said a sentence and rated it.

The rating already means *"without the avoidance behavior"* — the parent asks exactly that:
*"What would your rating be if you didn't do the avoidance behavior of not looking at her posts?"*
So our `distress_thermometer_when_refraining` matches the book's number. **That part is right.**

## Where ours diverges

Ours requires a rung to be assembled as **situation → behavior → score**, so rungs can only vary by
*which behavior you give up*. The book varies *which version of the situation you face*, holding
the behavior constant.

Consequence, seen in prod:

```
Baseball practice
  give up hanging in the clubhouse    7
  give up frequent bathroom trips     7      ← not a ladder; nothing to climb
```

A situation with two behaviors yields a two-rung ladder, both scored the same. There is no way to
express "three posts, home alone" — it is not a behavior, and it is not a sibling of "Attend
school".

## What the code actually does (grounded 2026-08-25 — this changes the answer)

`ladder_rungs` is **dead scaffolding**. Counts from prod:

```
exposure_ladders       55
ladder_rungs            0      ← never written
avoidance_behaviors   135
experiments            68      (68 link to a behavior, 0 to a rung)
```

Nothing creates a rung. The clinician builder derives the ladder from behaviors; the teen app reads
`/patient/behaviors/{id}` throughout (home, exposure, experiment, record); every experiment links via
`experiments.avoidance_behavior_id`.

**So "add text to `ladder_rungs`" is the biggest change available, not the smallest.** It means
populating a table nothing uses and moving the teen app and all experiment history onto it. My
earlier recommendation was wrong on cost — it assumed the table was wired up.

**Live bug found while checking:** `run_ladder_review` selects rungs by `ladder_id` and reviews the
result. With zero rungs it reviews an empty list, so "Run AI review" reports no flags no matter
what is on the ladder. It has never done anything.

## The actual shape of a rung today

A ladder line is **already a free-text sentence with a score**:

- `avoidance_behaviors.name` — free text, no constraint on what it says
- `avoidance_behaviors.distress_thermometer_when_refraining` — the number, already meaning
  "in this situation, without doing this"
- `experiments.avoidance_behavior_id` — what an exposure attaches to

That is a sentence, a number, and a hook for the experiment. Nothing in the schema requires the
sentence to describe a behavior. **What constrains us is the question we ask** — "what do you do so
it feels safer?" only ever produces behavior-shaped sentences.

## Shapes

### D. Change the question, not the structure *(recommended)*

Let a ladder line be any sentence the pair writes — a thing they do *or* a version of the situation
— stored in the same row it is stored in now. Quinn's ladder becomes six rows under her situation,
each with its sentence and its number.

- **No schema change at all.** `behavior_type` is a free string column, so scenario lines can carry
  a distinct value without a migration.
- Teen app, experiments, and all 68 rows of history keep working untouched.
- Nothing is destroyed and nothing is disabled — existing behavior rows are already valid lines.
- Cost: `avoidance_behaviors` becomes a misnomer for some rows. Cosmetic; renaming can wait.
- To check before building: whether the teen app branches on `behavior_type` anywhere.

### A. Rung gets its own text on `ladder_rungs`

The clean model on paper: rungs are their own thing, with optional provenance links. **Rejected on
cost** — see above. Revisit only if `ladder_rungs` ever earns its keep.

### B. Sub-situations

Nullable `parent_situation_id` on `trigger_situations`. Sub-situations are situations — same
fields, same behaviors, same scoring — grouped under a parent. Rungs stay behaviors.

- Smallest change; round 6 survives.
- Gets the ladder its rungs *if* each variant carries a behavior, so "three posts, home alone"
  becomes a situation whose behavior is the inherited avoidance. Workable but indirect: the
  sentence lives in the situation name and the score lives on a behavior row underneath it.
- Every situation list must then decide whether it shows children.

### C. Both

A once and B for grouping. Most faithful, most work, and B's value drops sharply once rungs carry
their own text.

## Recommendation

**D.** The structure already supports what the book does; the interview is what needed to change.
Owner (2026-08-25): implement the flexible approach *without permanently destroying the old
structure* — D does that by construction, since it adds no schema and disables nothing.

## Built

`BEHAVIOR_TYPE_SCENARIO = 'scenario'` in `PatientPage.tsx`. The add-rung form leads with **"A
version of this situation"**, then Avoidance / Safety / Ritual. A scenario rung asks *"How hard is
this version?"* instead of *"Fear level when refraining"*, and carries a teal `SIT` chip. Ladder
copy is now "What to face, and what to resist"; the button is "+ Add rung".

No migration, nothing disabled, all 135 behaviour rows and 68 experiments untouched.

## Open

1. **Session mode still only asks "what do you do so it feels safer?"** — the sub-situation
   brainstorm in the book happens *with the child* ("Let's brainstorm and see how many other
   sub-situations we can come up with"), so the walk should be able to add a version-of-this rung
   too. Not built.
2. Does session mode keep asking "what do you do so it feels safer?" as its own step? It is
   clinically needed for experiment design (*"what behavior would you want to do in this
   situation?"*). Assume yes — it just stops being the only way to make a rung.
3. Ordering: the book puts the **highest** rating at the top of the trigger list and calls the most
   feared situation "the top rung". Our ladder currently reads lowest-at-top per owner instruction
   (2026-08-23). Worth a second look now the source is in hand.
