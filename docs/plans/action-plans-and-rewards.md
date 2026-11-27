# Action plans and rewards — design plan

> **Drafted 2026-11-18** from Dr. Walker's answers, which Peter passed on the same day. Her text
> arrived with some tracked changes mixed in. Where the intended version was clear it is used below;
> where it was not, it is listed under **Questions** rather than guessed. Nothing here is built yet.
> This is clinical design: it goes to Peter, and the open points to Dr. Walker.

## What Dr. Walker said

### Action plans (for the child)

- After each session, the family has a short list of things to practice before the next one.
- About 10 minutes before the end of each session, the clinician and the youth decide together what
  will be practiced. That includes whether to keep practicing an item from the last plan.
- Items can be **for the child** (specific exposures, coping tools, strategies) or **for the parent**
  (for example, stop checking homework, or how to respond to crying).
- An item that is already on the exposure ladder, or is an accommodation the parent is working on,
  **links to it** rather than being entered twice.
- **Anything new is practiced in session with the clinician first**, before the youth is asked to do
  it on their own as part of the plan.
- **Before committing to the plan, the youth's confidence is checked: low, medium or high.** If it is
  not high, the clinician and youth adjust the plan until it is.
- The plan should take **no more than 10 to 15 minutes a day**.
- The plan shows in **both the child's app and the parent's app**.

### The parent's part

- The clinician meets the parents **without the child** to identify specific accommodations and the
  kinds of situations they happen in.
- The clinician assesses **how comfortable the parent is giving up each accommodation**. Parents are
  often anxious about stopping reassurance and the like. If a parent is not comfortable, the clinician
  explores the parent's concerns. **There is no point involving the child until the parent is willing
  to change.**
- The clinician and parents build the plan together, from what they believe the child and parent can
  tolerate, **just like an exposure ladder**.
- **Before a change is put into practice, the clinician checks with the child** how much distress they
  predict they will feel when the parent changes.

### Rewards

- At the start of treatment, the parent and child make a list of rewards. **The child can suggest;
  the parent decides.**
- Rewards must be what the child is willing to work for, not what the parent thinks is appropriate,
  and consistent with the family's values.
- **Ages 8 to 10:** a physical reward, given straight away. **Preteens and teens:** points toward a
  bigger reward can be planned, depending on maturity, but immediate rewards are still the most
  effective.
- The list is kept in the **parent's app**. The parent app records **when a reward is given and for
  what task**.

## What Float has today

- **Action plans exist but are switched off** (`SHOW_ACTION_PLANS` in
  `apps/web/src/lib/featureFlags.ts`, since 2026-09-01). Today's version is a free-text summary with a
  date and nickname, published to the child's app, plus loose lists (`exposures`,
  `behaviors_to_resist`, `parent_instructions`, `coping_tools`, `cognitive_strategies`) in
  `backend/app/models/action_plan.py`. Items are text; nothing links to a rung or an accommodation;
  there is no confidence check and no time limit.
- **Accommodations already work like a ladder** (`docs/plans/parent-accommodations-like-the-ladder.md`):
  ordered by the child's distress, with the child's own rating (`distress_min/max`, `child_rated_at`),
  the parent's estimate beside it, and where the parent has got to (not started, working on it,
  stopped). **Missing:** the parent's comfort with giving each one up, and the rule that the child is
  not involved until the parent is willing.
- **Experiments** (a child's exposure) already store a `confidence_level`.
- **Rewards:** nothing built. The backlog has a "Rewards — needs a plan" item; this replaces it.

## Design — agreed with Peter, 2026-11-18, updated 2026-11-25

Peter went through the questions one at a time. His answers replace the proposal that was here.
On 2026-11-25 he changed three things: exposures can be reworded and have notes, tools and
strategies come from a list, and rewards are part of the action plan.

### Action plans

**What it looks like:**

```
Action plan · Session 4 · Nov 18
For Sam, until the next session (Nov 25)

SAM
  Exposures
  □ Answer one question in class            ← rung, Fear Level 5
      Note: in maths, where he knows the teacher
  □ Order lunch in the cafeteria myself     ← rung, Fear Level 6 (kept from last week)
  Tools
  □ Watch "The worry hill"                  ← from the tools list
  □ Slow breathing                          ← from the tools list
      Note: before he leaves for school

MOM AND DAD
  Accommodations to work on
  □ Stop checking homework every night      ← from the parent ladder
  How to help
  □ When he cries, acknowledge it once, then don't keep reassuring

REWARDS
  □ Pick the movie on Friday — for answering a question in class
  □ 20 minutes extra game time — for ordering lunch himself

Sam's confidence: High
```

- **When:** made in the last part of each session, in session mode. One plan per session.
- **Items:** a rung on the ladder or an accommodation from the parent's ladder (linked, not
  retyped), a tool or strategy from the tools list, or short text for a parent instruction.
- **Exposures** are chosen from the child's ladder. The clinician can change the wording on the
  plan and add a note. Changing it on the plan does not change the rung on the ladder.
- **Tools and strategies** are chosen from a list only; the clinician cannot type their own. The
  clinician can add a note to a tool on the plan. A tool can be a technique with a description, or
  something to learn or watch, such as "The worry hill". Peter writes the list later.
- **The parent section** has the accommodations the parent is working on now, chosen from the
  parent's ladder, and the typed "How to help" instructions.
- **Formats:** the plan shows in the app, and may also be a separate document. In the app the items
  are live links; in a document they name the rung or accommodation but are not connected.
- **Carry-over:** a new plan starts from the last plan's items, each marked *keep practicing* or
  *done*. Kept items stay linked.
- **Confidence, the last step:** the youth's confidence that they can do it, low, medium or high,
  entered on the session screen. The clinician is in control; who taps it does not matter. Not high:
  they adjust the items. Saved only at high.
- **Who sees what:** the parent sees the whole plan. The child sees their own items, plus any parent
  item the clinician marks *share with child*. The clinician sees everything.
- **Practiced in session first:** Float does not check this; it does not record where an exposure
  was done. The clinician follows the rule, and it goes in the clinician guide.
- **No daily time limit** for now. The 10 to 15 minutes is left out of this version (Peter).
- **Replaces today's action plans.** The free-text version, switched off since 2026-09-01, goes.
  Pre-launch its saved plans are test data; the PR that does it says plainly what it drops.

### The parent's part (the accommodation ladder that exists)

- **No new comfort rating.** The parent's own estimate of the child's Fear Level if they stop
  (`parent_estimate_min/max`, already beside the child's rating) is how ready the parent is. The
  clinician talks through the high ones.
- **Willing first, with no new lock:** the accommodation stays *not started* until the parent is
  willing; the clinician moves it on. It goes on an action plan only after that.
- **The child's predicted distress** is already on the ladder (`distress_min/max`). The clinician
  checks it before the accommodation goes on a plan.

### Rewards — part of the action plan (changed 2026-11-25)

On 2026-11-18 rewards were a separate feature with their own list. Peter, 2026-11-25: keep them
inside action plans for now, because it is simpler.

- A plan can have **several rewards**. Each one says what the reward is and what it is given for.
  Both are typed on the plan. There is no separate list of rewards.
- **The parent is asked, for each reward, whether it was given**, in the parent's app.
- If the parent has not answered by the next session, **the clinician asks** and marks it when
  checking progress on the plan.

Set aside for now (from 2026-11-18): a reward list made at the start of treatment, where the child
suggests and the parent decides; points toward a bigger reward; and the clinician editing that list.

## Order to build

1. Action plan items, carry-over and links, in session mode (clinician side), replacing today's plans.
2. The confidence step.
3. The child's app and the parent's app showing the plan; switch `SHOW_ACTION_PLANS` back on.
4. The document version of the plan (with the reference sheets, see `docs/backlog.md`).
5. Rewards on the plan, and the parent's "was it given?" answer. Step 1 can include typing them in.
6. The tools and strategies list. Plans have no tools until Peter has written it.

Each step is a clinical change and waits for Peter's review. Session prep (item 4 of
`ai-foundation-and-features.md`) can later draft the carry-over from the last plan.

## Dr. Walker review queue

- **Points for every age** (set aside 2026-11-25 along with the reward list). She said points are for preteens and teens (and in September "only for
  children over 10"), with an immediate physical reward for ages 8 to 10. Peter decided points are on
  by default for every child, with the clinician able to turn them off. Immediate rewards stay
  available for everyone.
- **No daily time limit** in the first version, though she said 10 to 15 minutes a day at most.
- **Float does not check** that a new exposure was practiced in session first; it is in the
  clinician guide instead.
- **Parent comfort** is read from the parent's own estimate, not a separate rating.
