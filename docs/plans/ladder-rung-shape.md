# What is a rung?

> **STATUS: open question, 2026-08-25.** Nothing built. Re-opens round 6 of
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

## Three shapes

### A. Rung gets its own sentence *(recommended)*

`ladder_rungs` already exists with an order, a score, and an optional behavior link — it is missing
only its own text. Add it. A rung becomes a sentence + a number, with optional links back to the
situation and behavior it came from.

Situations and behaviors stop being the ladder's structure and become what they already are in
practice: **the interview that generates the sentences.**

- Expresses Quinn's ladder exactly as written.
- Nothing captured today is lost; existing rungs keep their behavior link.
- Cost: the ladder builder and the teen ladder read rung text instead of behavior name. Session
  mode's "score each behavior" step becomes "write the rungs", which is a real UI change.

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

**A.** It is the smaller change *and* the closer fit — B needs a situation row plus a behavior row
per rung to say what one sentence says. The thing to weigh against it is that round 6 chose
behavior-scored rungs deliberately, and the teen app reads that shape today.

## Open

1. A, B, or C.
2. If A: does session mode still elicit behaviors per situation (they are clinically needed for
   experiment design — *"what behavior would you want to do in this situation?"*) even though they
   are no longer the rungs? Assume yes unless told otherwise.
3. Ordering: the book puts the **highest** rating at the top of the trigger list and calls the most
   feared situation "the top rung". Our ladder currently reads lowest-at-top per owner instruction
   (2026-08-23). Worth a second look now the source is in hand.
